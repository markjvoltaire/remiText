# Background worker

The **remiText background worker** is a long-running Node process that listens for inbound iMessages (via Photon Spectrum), runs Remi’s AI agent, and sends replies. It is **not** the landing site (`remi-one-pager`). Production runs on [Render](https://render.com) as a **worker** service (`render.yaml`).

---

## What it does (product view)

| Step | What happens |
|------|----------------|
| User texts Remi | Message arrives on Remi’s iMessage line (Photon) |
| Worker receives it | Spectrum stream delivers the message to our process |
| We handle it | Dedupe, look up user, run Claude + tools, reply |
| User sees Remi | Blue bubble from Remi, not Photon’s gray fallback |

If the worker is **not connected** when a text arrives, Photon may send its generic gray auto-reply (“number didn’t recognize yours”). That is **not** Remi failing at flights or restaurants — the message never reached our code.

---

## Architecture (high level)

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐     ┌──────────┐
│   User      │────▶│   Photon     │────▶│  Spectrum       │────▶│ remiText │
│  (iMessage) │     │  (iMessage)  │     │  (stream API)   │     │  worker  │
└─────────────┘     └──────────────┘     └─────────────────┘     └────┬─────┘
                                                                       │
                    ┌──────────────┐     ┌─────────────────┐          │
                    │  Supabase    │◀────│  Claude + tools │◀─────────┘
                    │  (users,     │     │  (Duffel, Resy, │
                    │   history)   │     │   Stripe, etc.) │
                    └──────────────┘     └─────────────────┘
```

**One worker per `PROJECT_ID` should consume the stream.** Multiple consumers on the same project overload Spectrum’s rate limits (`429`), cause reconnect churn, and create gaps where no one is listening.

---

## Startup sequence

Entry point: `src/index.ts`.

1. **Load env** (`dotenv`)
2. **Verify Supabase** — `seen_messages` table must exist (message dedupe)
3. **Health server** — if `PORT` is set, `GET /` reports stream/lease status (Render health checks)
4. **Single-instance lease** (optional but on in production) — see [Worker lease](#worker-lease-single-instance-guard)
5. **Spectrum forever loop** — `runSpectrumForever()` in `src/stream/session.ts`

Boot log example:

```text
[boot] Remi starting staleMs=off refreshMs=21600000 flightCard=... lease=on healthPort=10000
[lease] acquired id=spectrum:<PROJECT_ID> holder=...
[stream] connecting provider=imessage
[stream] connected staleMs=off refreshMs=21600000
```

---

## Worker lease (single-instance guard)

**Problem:** Two processes with the same `PROJECT_ID` (e.g. Render + local `npm start`, or overlapping deploys) both call `Spectrum()` to connect. Spectrum rate-limits by IP (`429`). Every worker reconnects in a loop; during backoff, inbound texts get Photon’s gray reply.

**Solution:** A Supabase-backed lease — only the holder may open the Spectrum stream.

| State | Behavior |
|-------|----------|
| **Active** | Holds lease → connects to Spectrum → processes `[msg]` |
| **Standby** | Polls lease every ~15s → **does not connect** → logs `standing by` |
| **Shutdown** | `SIGTERM` / `SIGINT` → releases lease → standby can take over quickly |

**Implementation:**

- Table + RPCs: `supabase/migrations/20250528120000_create_worker_lease.sql`
- Logic: `src/stream/lease.ts`
- Wired in: `src/index.ts`

Lease key: `spectrum:<PROJECT_ID>`.

If the migration is missing, the worker logs a warning and runs **without** the guard (same as before the feature).

### Lease environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `WORKER_LEASE_ENABLED` | `1` (on) | Set to `0` to disable |
| `WORKER_LEASE_TTL_MS` | `60000` | Lease expiry if not renewed |
| `WORKER_LEASE_HEARTBEAT_MS` | `TTL / 3` | How often to renew |
| `WORKER_LEASE_WAIT_POLL_MS` | `15000` | Standby poll interval |

Requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

---

## Spectrum stream lifecycle

Code: `src/stream/session.ts`, `src/stream/reconnect.ts`, `src/stream/health.ts`.

### Connect and consume

1. `Spectrum({ projectId, projectSecret, providers })` — provider from `SPECTRUM_PROVIDER` (`imessage` or `terminal`)
2. Mark connected, optionally warm Resy auth
3. `for await` over `app.messages` — each inbound message goes to `handleMessage`

### Why the session ends (and reconnects)

| Reason | Meaning |
|--------|---------|
| `ended` | Iterator finished unexpectedly |
| `stale` | No inbound for `STREAM_STALE_MS` (off in production) |
| `refresh` | Connected longer than `STREAM_REFRESH_MS` (6h on Render) — proactive recycle |
| `error` | Connect failed or iterator threw |

After any end, the worker backs off (`computeReconnectDelayMs` or longer for `429`) and connects again.

### Rate limits (`429`)

Spectrum limits `createClient` calls per IP per minute. Symptoms in logs:

```text
[stream] Spectrum rate limited (429) — backing off before reconnect
[stream] reconnect in 65.0s (rate limit attempt 1)
```

**Operational rule:** Only one live remiText worker per `PROJECT_ID`. Stop local `npm start` when Render is live.

### Stream environment variables (Render defaults)

| Variable | Render value | Purpose |
|----------|--------------|---------|
| `STREAM_STALE_MS` | `0` | Idle recycle (off — was causing extra connects) |
| `STREAM_REFRESH_MS` | `21600000` (6h) | Proactive reconnect while healthy |
| `STREAM_RATE_LIMIT_BACKOFF_MS` | `60000` | Base backoff after 429 |
| `SPECTRUM_PROVIDER` | `imessage` | Use `terminal` for local lease tests without iMessage |

---

## Message pipeline

Code: `src/handlers/message.ts`.

For each inbound message:

1. **Dedupe** — `claimMessage(id)` inserts into `seen_messages`; duplicate → skip (safe across restarts/instances)
2. **Mark read** — Photon advanced client
3. **Resolve sender** — normalize phone/email via `normalizeContactKey`
4. **User lookup** — `getUserByPhone`
   - **No user** → onboarding flow (`onboarding_sessions`)
   - **User exists** → load history, run `runAgentLoop` (Claude + tools), strip markdown, `message.reply`
5. **Logging** — `[msg] id=... sender=... inbound_len=...` (no full body in logs by default)

Successful handling always produces a `[msg]` line in logs. **No `[msg]`** for a user text means the worker never received it (stream down, duplicate consumer churn, or wrong environment).

---

## Health checks

If `PORT` is set (e.g. `10000` on Render), `GET /` returns:

| Body | HTTP | Meaning |
|------|------|---------|
| `ok` | 200 | Connected to Spectrum |
| `connecting` | 200 | Opening stream |
| `standby (waiting for worker lease)` | 200 | Waiting for lease (intentionally not connecting) |
| `reconnecting` | 200 | Between sessions, retrying soon |
| `stream reconnecting (...)` | 503 | Stuck reconnecting > `STREAM_RECONNECT_UNHEALTHY_MS` |
| `stream failed: ...` | 503 | Last connect failed |

Render uses `healthCheckPath: /` in `render.yaml`.

---

## Deployment

- **Platform:** Render worker (`render.yaml`)
- **Build:** `npm install && npm run build`
- **Start:** `npm start` → `node dist/index.js`
- **Auto-deploy:** commits to `main`

Secrets (`PROJECT_ID`, `PROJECT_SECRET`, Supabase, Anthropic, Duffel, Resy, Stripe, etc.) are set in Render, not committed.

---

## Local development

### Run the worker

```bash
cd remiText
npm run dev    # tsx src/index.ts
# or
npm run build && npm start
```

### Test the lease (two terminals, no iMessage)

```bash
# Terminal A
SPECTRUM_PROVIDER=terminal WORKER_LEASE_WAIT_POLL_MS=3000 npm run dev

# Terminal B (same .env)
SPECTRUM_PROVIDER=terminal WORKER_LEASE_WAIT_POLL_MS=3000 npm run dev
```

- A: `[lease] acquired` → `[stream] connected`
- B: `[lease] another worker holds ... — standing by` (no `[stream] connecting`)
- Ctrl+C A → B should acquire within a few seconds

### Test real iMessage locally

Use **either** Render **or** local, not both on the same `PROJECT_ID`. If Render holds the lease, local will standby and not receive texts.

### Disable lease (debug only)

```bash
WORKER_LEASE_ENABLED=0 npm run dev
```

---

## Troubleshooting

| Symptom | Likely cause | What to check |
|---------|----------------|---------------|
| Gray Photon reply, no `[msg]` in logs | No consumer attached | `[stream] connected` stable? 429/reconnect loop? Second worker running? |
| `[msg]` but no Remi reply | Handler/agent error | `[msg] handler error`, Claude/API logs |
| Works once, fails next message | Stream dropped between messages | Render logs around send time: reconnect, 429 |
| Local dev “does nothing” | Standby or wrong repo | remiText vs remi-one-pager; Render still live? |

**Reliable test checklist**

1. Render logs: `[stream] connected` with no reconnect spam for 2+ minutes  
2. Text Remi once → confirm `[msg]`  
3. Text again (e.g. flight query) → second `[msg]` with expected `inbound_len`  
4. If gray reply and no `[msg]`, paste logs from `[stream] connecting` through the next 30s  

---

## Key source files

| Path | Role |
|------|------|
| `src/index.ts` | Boot, lease, health server, start stream loop |
| `src/stream/session.ts` | Spectrum connect, message loop, reconnect forever |
| `src/stream/lease.ts` | Single-instance acquire / heartbeat / release |
| `src/stream/health.ts` | Connection state + HTTP health |
| `src/stream/reconnect.ts` | Backoff, 429 detection, sleep |
| `src/handlers/message.ts` | Per-message pipeline |
| `src/services/supabase.ts` | DB + lease RPCs |
| `render.yaml` | Render worker config |
| `supabase/migrations/20250528120000_create_worker_lease.sql` | Lease schema |

For deeper implementation detail (tools, onboarding, cards), see `PROJECT_CONTEXT.md` in the repo root.

New 