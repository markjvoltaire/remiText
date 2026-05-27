import type { ReactElement } from "react";

export interface FlightCardInput {
  airline: string;
  logoUrl?: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  price: string;
  duration: string;
  stops?: number;
  date?: string;
  cabinClass?: string;
  gate?: string;
  terminal?: string;
  flightNumber?: string;
  optionLabel?: string;
}

/** Remi preview card — warm editorial, ambient concierge (not boarding-pass chrome). */
const CANVAS = "#F7F6F3";
const SURFACE = "#FFFFFF";
const INK = "#1A1A1A";
const MUTED = "#787774";
const LINE = "#E8E6E1";
const WHISPER = "rgba(26, 26, 26, 0.06)";

function stopsLabel(stops?: number): string {
  if (stops == null || stops <= 0) return "nonstop";
  if (stops === 1) return "1 stop";
  return `${stops} stops`;
}

function airlineInitials(airline: string): string {
  const initials = airline
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return initials || "?";
}

function compactTimeLabel(raw: string): string {
  const s = raw.trim();
  const m12 = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m12) {
    const h = parseInt(m12[1]!, 10);
    const min = m12[2]!;
    const suffix = m12[3]!.toLowerCase() === "am" ? "a" : "p";
    const h12 = h % 12 || 12;
    return `${h12}:${min}${suffix}`;
  }
  return s;
}

function formatOptionLabel(label?: string): string {
  if (!label?.trim()) return "flight";
  return label.trim().toLowerCase();
}

function RouteArrow(): ReactElement {
  return (
    <svg width={48} height={24} viewBox="0 0 48 24" style={{ display: "block" }}>
      <path
        d="M4 12h32M30 6l8 6-8 6"
        stroke={MUTED}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function FlightCard(data: FlightCardInput): ReactElement {
  const stops = stopsLabel(data.stops);
  const date = data.date ?? "";
  const optionLabel = formatOptionLabel(data.optionLabel);
  const dep = compactTimeLabel(data.departureTime);
  const arr = compactTimeLabel(data.arrivalTime);
  const meta = [data.duration, stops].filter(Boolean).join(" · ");
  const flightMeta = data.flightNumber
    ? `${data.airline} · ${data.flightNumber}`
    : data.airline;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        backgroundColor: CANVAS,
        color: INK,
        fontFamily: "Inter",
        padding: 48,
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: SURFACE,
          border: `1px solid ${LINE}`,
          borderRadius: 16,
          padding: "56px 64px 52px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 48,
            right: 48,
            height: 3,
            backgroundColor: INK,
            opacity: 0.08,
            borderRadius: 2,
          }}
        />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: -0.5,
              color: INK,
              display: "flex",
            }}
          >
            remi
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 400,
              color: MUTED,
              letterSpacing: 0.3,
              display: "flex",
            }}
          >
            {optionLabel}
          </div>
        </div>

        <div
          style={{
            marginTop: 72,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 20,
            }}
          >
            <div
              style={{
                fontSize: 52,
                fontWeight: 700,
                letterSpacing: -1.5,
                lineHeight: 1.05,
                color: INK,
                display: "flex",
              }}
            >
              {data.origin}
            </div>
            <div
              style={{
                fontSize: 26,
                fontWeight: 400,
                color: MUTED,
                paddingBottom: 6,
                display: "flex",
              }}
            >
              to
            </div>
            <div
              style={{
                fontSize: 52,
                fontWeight: 700,
                letterSpacing: -1.5,
                lineHeight: 1.05,
                color: INK,
                display: "flex",
              }}
            >
              {data.destination}
            </div>
          </div>
          {date ? (
            <div
              style={{
                fontSize: 28,
                fontWeight: 400,
                color: MUTED,
                marginTop: 16,
                display: "flex",
              }}
            >
              {date}
            </div>
          ) : null}
        </div>

        <div
          style={{
            marginTop: 88,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", width: 300 }}>
            <div
              style={{
                fontSize: 72,
                fontWeight: 700,
                letterSpacing: -2,
                lineHeight: 1,
                display: "flex",
              }}
            >
              {dep}
            </div>
            <div
              style={{
                fontSize: 32,
                fontWeight: 400,
                color: MUTED,
                marginTop: 12,
                display: "flex",
              }}
            >
              {data.origin}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              paddingBottom: 8,
            }}
          >
            <RouteArrow />
            {meta ? (
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 400,
                  color: MUTED,
                  marginTop: 14,
                  textAlign: "center",
                  display: "flex",
                }}
              >
                {meta}
              </div>
            ) : null}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              width: 300,
            }}
          >
            <div
              style={{
                fontSize: 72,
                fontWeight: 700,
                letterSpacing: -2,
                lineHeight: 1,
                display: "flex",
              }}
            >
              {arr}
            </div>
            <div
              style={{
                fontSize: 32,
                fontWeight: 400,
                color: MUTED,
                marginTop: 12,
                display: "flex",
              }}
            >
              {data.destination}
            </div>
          </div>
        </div>

        <div
          style={{
            height: 1,
            backgroundColor: LINE,
            marginTop: 96,
          }}
        />

        <div
          style={{
            marginTop: 40,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            {data.logoUrl ? (
              <img
                src={data.logoUrl}
                width={120}
                height={40}
                style={{ objectFit: "contain", display: "flex" }}
              />
            ) : (
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 8,
                  backgroundColor: WHISPER,
                  color: INK,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 20,
                  fontWeight: 700,
                }}
              >
                {airlineInitials(data.airline)}
              </div>
            )}
            <div
              style={{
                fontSize: 26,
                fontWeight: 400,
                color: MUTED,
                maxWidth: 420,
                display: "flex",
              }}
            >
              {flightMeta}
            </div>
          </div>

          <div
            style={{
              fontSize: 64,
              fontWeight: 700,
              letterSpacing: -1.5,
              lineHeight: 1,
              color: INK,
              display: "flex",
            }}
          >
            {data.price}
          </div>
        </div>
      </div>
    </div>
  );
}
