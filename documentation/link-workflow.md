# Stripe Link workflow (Remi)

Remi uses [@stripe/link-cli](https://www.npmjs.com/package/@stripe/link-cli) (v0.5) via an isolated `link-cli-runner/` install so it does not conflict with Satori’s React version. The worker spawns `link-cli` per user with credentials hydrated from Supabase.

## Product goal

Let users **connect their Stripe Link wallet over iMessage**, then (later) **approve bounded purchases** — one-time virtual cards for merchant checkout, or MPP / shared payment tokens for HTTP 402 flows — without leaving the thread.

US Link accounts only. Flights still use Duffel + `stripe_spt_id` when that rail is enabled.

---

## Architecture

```
User (iMessage)
    → handleMessage
    → runAgentLoop (Claude + tools)
    → linkCli.ts (spawn link-cli --auth <per-user file>)
    → Supabase users.link_auth_json
```

| Piece | Location |
|-------|----------|
| CLI wrapper | `src/services/linkCli.ts` |
| Agent tools | `src/ai/tools.ts` + `executeTool` in `src/ai/claude.ts` |
| Credential storage | `users.link_auth_json`, `users.link_connected_at` |
| Connect-in-progress flag | `users.link_connect_started_at` |
| Isolated CLI deps | `link-cli-runner/` (`postinstall` runs `npm install` there) |
| Auth files on disk | `.link-auth/<userId>.json` (mode 600; never log) |

---

## Signup flow (SMS + web)

1. User texts Remi → SMS collects **first name**, **last name**, **email**.
2. Remi creates a `users` row and texts the **signup link** (`/signup?phone=…` on remi-one-pager).
3. User opens the link → **Connect Link** step (Stripe Link app approval).
4. User texts back when done → Remi welcomes them; full agent is available only after `link_connected_at` / `link_auth_json` is set.

---

## Phase 1 — Connect wallet (shipped)

### Tools

| Tool | CLI | Purpose |
|------|-----|---------|
| `link_connect` | `auth login` | Returns `verification_url` + optional `phrase` |
| `link_auth_status` | `auth status` (+ optional poll) | Check / wait for authentication |
| `link_payment_methods_list` | `payment-methods list` | Cards on Link |
| `link_shipping_address_list` | `shipping-address list` | Saved addresses |

### Happy path

1. User asks to connect Link (or agent needs wallet for a purchase).
2. Agent calls `link_connect` → user gets URL + phrase in SMS.
3. User approves in Link app, texts back (“done”, “approved”, …).
4. `augmentLinkConnectApproval` in `message.ts` nudges the agent to call `link_auth_status` with `poll_until_authenticated: true`.
5. On success, credentials persist to `link_auth_json` and `link_connected_at`; `link_connect_started_at` clears.

### Agent rules (system prompt)

- Check `link_auth_status` before `link_connect`.
- One tool per turn after connect URL is sent.
- Do not send signup website links for Link.

---

## Phase 2 — Spend requests (next)

`link-cli spend-request create` issues a **user-approved** one-time credential:

- **`card`** — virtual card for checkout forms (needs `merchant-name`, `merchant-url`, `amount`, `context` ≥ 100 chars).
- **`shared_payment_token`** — MPP / HTTP 402 (needs `network-id` from `mpp decode`).

Planned tools:

| Tool | Maps to |
|------|---------|
| `link_spend_request_create` | `spend-request create` |
| `link_spend_request_retrieve` | `spend-request retrieve` |
| `link_spend_request_cancel` | `spend-request cancel` |
| `link_mpp_decode` | `mpp decode` |
| `link_mpp_pay` | `mpp pay` |

Open design questions:

- Store pending spend request id on `users` (like `pending_restaurant_booking`)?
- How Remi delivers card details over SMS (redacted vs secure link; `output-file` is server-side only).
- Browserbase checkout vs user pastes card on merchant site.

---

## Phase 3 — Browser / merchant checkout (later)

- Browserbase + Playwright for sites that need form fill.
- Tie to spend-request `card` credentials with strict amount caps (default max $500 per CLI).

---

## Ops checklist

- [ ] Migration `20250525100000_add_link_wallet.sql` applied (+ `link_connect_started_at` when added).
- [ ] `cd link-cli-runner && npm install` on Render (via root `postinstall`).
- [ ] `.link-auth` writable on worker (or set `LINK_AUTH_DIR`).
- [ ] Optional: `LINK_CLI_CLIENT_NAME`, `LINK_CLI_TIMEOUT_MS`.

Local smoke:

```bash
cd link-cli-runner && npm install
cd .. && npm run dev
# Text Remi: "connect my link wallet"
```

---

## Security

- Never log `link_auth_json`, card numbers, or CVC.
- `linkCli.ts` redacts sensitive fields in warn logs.
- Per-user auth files are mode `600`; directory mode `700`.
