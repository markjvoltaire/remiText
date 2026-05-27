import type { ReactElement } from "react";
import { REMI } from "../remiTheme.js";

export interface FlightCardInput {
  airline: string;
  logoUrl?: string;
  origin: string;
  destination: string;
  originCity?: string;
  destinationCity?: string;
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
  seat?: string;
  optionLabel?: string;
}

const AIRPORT_CITIES: Record<string, string> = {
  ATL: "Atlanta",
  BOS: "Boston",
  CLT: "Charlotte",
  DFW: "Dallas",
  DEN: "Denver",
  EWR: "Newark",
  FLL: "Fort Lauderdale",
  IAD: "Washington",
  JFK: "New York",
  LAS: "Las Vegas",
  LAX: "Los Angeles",
  LHR: "London",
  MCO: "Orlando",
  MIA: "Miami",
  ORD: "Chicago",
  PHX: "Phoenix",
  SEA: "Seattle",
  SFO: "San Francisco",
};

function cityName(iata: string, override?: string): string {
  if (override?.trim()) return override.trim();
  return AIRPORT_CITIES[iata.toUpperCase()] ?? "";
}

function formatOptionLabel(label?: string): string {
  if (!label?.trim()) return "option 1";
  return label.trim().toLowerCase();
}

function formatBoardingTime(raw: string): string {
  const s = raw.trim();
  const m12 = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m12) {
    const h = parseInt(m12[1]!, 10);
    const min = m12[2]!;
    const suffix = m12[3]!.toLowerCase();
    const h12 = h % 12 || 12;
    return `${h12}:${min} ${suffix}`;
  }
  return s;
}

function formatCardDate(raw?: string): string {
  if (!raw?.trim()) return "";
  const withoutOrdinal = raw.replace(/(\d+)(st|nd|rd|th)\b/i, "$1");
  return withoutOrdinal;
}

function formatCabin(raw?: string): string {
  if (!raw?.trim()) return "Economy";
  const s = raw.trim();
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function zoneLabel(data: FlightCardInput): string {
  if (data.terminal?.trim()) return data.terminal.trim();
  if (data.gate?.trim()) return data.gate.trim();
  return "--";
}

function barcodeSeed(data: FlightCardInput): string {
  return [data.flightNumber, data.origin, data.destination, data.date].filter(Boolean).join("|");
}

function MapPattern(): ReactElement {
  const dots: ReactElement[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 14; col++) {
      if ((row + col) % 3 === 0) {
        dots.push(
          <circle
            key={`${row}-${col}`}
            cx={40 + col * 72}
            cy={24 + row * 44}
            r={2}
            fill={REMI.tile}
          />,
        );
      }
    }
  }
  return (
    <svg
      width="100%"
      height={280}
      viewBox="0 0 984 280"
      style={{ position: "absolute", top: 0, left: 0, display: "flex" }}
    >
      {dots}
      <path
        d="M120 200 Q492 80 864 200"
        stroke={REMI.line}
        strokeWidth={1.5}
        fill="none"
      />
    </svg>
  );
}

function RouteArc(): ReactElement {
  return (
    <svg width={520} height={100} viewBox="0 0 520 100" style={{ display: "flex" }}>
      <path
        d="M24 72 Q260 8 496 72"
        stroke={REMI.lineDashed}
        strokeWidth={2}
        strokeDasharray="10 10"
        fill="none"
      />
      <circle cx={24} cy={72} r={9} fill={REMI.primary} />
      <circle cx={496} cy={72} r={9} fill={REMI.primary} />
      <path
        d="M248 28 L268 38 L258 48 L278 38 Z"
        fill={REMI.primary}
        transform="rotate(12 258 38)"
      />
    </svg>
  );
}

function Barcode({ seed }: { seed: string }): ReactElement {
  const bars: ReactElement[] = [];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  for (let i = 0; i < 52; i++) {
    hash = (hash * 1103515245 + 12345 + i) | 0;
    const wide = Math.abs(hash) % 4 === 0;
    bars.push(
      <div
        key={i}
        style={{
          width: wide ? 5 : 3,
          height: 108,
          backgroundColor: REMI.primary,
          marginRight: 2,
          display: "flex",
        }}
      />,
    );
  }
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-end",
        width: "100%",
        paddingLeft: 24,
        paddingRight: 24,
      }}
    >
      {bars}
    </div>
  );
}

function InfoCell({
  label,
  value,
  align = "center",
}: {
  label: string;
  value: string;
  align?: "left" | "center" | "right";
}): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center",
        flex: 1,
      }}
    >
      <div
        style={{
          fontSize: 22,
          fontWeight: 400,
          color: REMI.mutedForeground,
          display: "flex",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 34,
          fontWeight: 700,
          color: REMI.primary,
          marginTop: 10,
          display: "flex",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function TicketPerforation(): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        position: "relative",
        height: 40,
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: REMI.bg,
          position: "absolute",
          left: -14,
          display: "flex",
        }}
      />
      <div
        style={{
          flex: 1,
          borderTop: `2px dashed ${REMI.lineDashed}`,
          marginLeft: 20,
          marginRight: 20,
          display: "flex",
        }}
      />
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: REMI.bg,
          position: "absolute",
          right: -14,
          display: "flex",
        }}
      />
    </div>
  );
}

export function FlightCard(data: FlightCardInput): ReactElement {
  const origin = data.origin.toUpperCase();
  const destination = data.destination.toUpperCase();
  const originCity = cityName(origin, data.originCity);
  const destCity = cityName(destination, data.destinationCity);
  const optionLabel = formatOptionLabel(data.optionLabel);
  const boardingTime = formatBoardingTime(data.departureTime);
  const flightDate = formatCardDate(data.date);
  const cabin = formatCabin(data.cabinClass);
  const seat = data.seat?.trim() || "--";
  const flightNo = data.flightNumber?.trim() || "--";
  const zone = zoneLabel(data);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: REMI.bg,
        color: REMI.foreground,
        fontFamily: REMI.fontFamily,
        padding: "40px 44px 48px",
      }}
    >
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 24,
          paddingBottom: 36,
          minHeight: 300,
        }}
      >
        <MapPattern />

        <div
          style={{
            position: "absolute",
            top: 8,
            right: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
          }}
        >
          <div
            style={{
              fontSize: 20,
              color: REMI.mutedForeground,
              display: "flex",
            }}
          >
            total
          </div>
          <div
            style={{
              fontSize: 40,
              fontWeight: 700,
              color: REMI.primary,
              display: "flex",
            }}
          >
            {data.price}
          </div>
        </div>

        <div
          style={{
            fontSize: 20,
            fontWeight: 500,
            color: REMI.eyebrow,
            letterSpacing: 2.8,
            textTransform: "uppercase",
            marginBottom: 28,
            display: "flex",
          }}
        >
          {optionLabel}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            width: "100%",
            paddingLeft: 8,
            paddingRight: 8,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: 64,
                fontWeight: 700,
                letterSpacing: -2.2,
                color: REMI.foreground,
                display: "flex",
              }}
            >
              {origin}
            </div>
            {originCity ? (
              <div
                style={{
                  fontSize: 30,
                  fontWeight: 600,
                  color: REMI.foreground,
                  marginTop: 6,
                  display: "flex",
                }}
              >
                {originCity}
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: 64,
                fontWeight: 700,
                letterSpacing: -2.2,
                color: REMI.foreground,
                display: "flex",
              }}
            >
              {destination}
            </div>
            {destCity ? (
              <div
                style={{
                  fontSize: 30,
                  fontWeight: 600,
                  color: REMI.foreground,
                  marginTop: 6,
                  display: "flex",
                }}
              >
                {destCity}
              </div>
            ) : null}
          </div>
        </div>

        <div style={{ marginTop: 8, display: "flex" }}>
          <RouteArc />
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          backgroundColor: REMI.card,
          border: `1px solid ${REMI.border}`,
          borderRadius: REMI.radiusCard,
          padding: "40px 36px 44px",
          marginBottom: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            marginBottom: 36,
            minHeight: 56,
          }}
        >
          {data.logoUrl ? (
            <img
              src={data.logoUrl}
              width={200}
              height={48}
              style={{ objectFit: "contain", display: "flex" }}
            />
          ) : (
            <div
              style={{
                fontSize: 32,
                fontWeight: 700,
                color: REMI.primary,
                display: "flex",
              }}
            >
              {data.airline}
            </div>
          )}
        </div>

        <div style={{ display: "flex", width: "100%" }}>
          <InfoCell label="Flight date" value={flightDate || "--"} />
          <InfoCell label="Zone" value={zone} />
          <InfoCell label="Flight number" value={flightNo} />
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          backgroundColor: REMI.card,
          border: `1px solid ${REMI.border}`,
          borderRadius: REMI.radiusCard,
          padding: "40px 36px 44px",
          flex: 1,
        }}
      >
        <div style={{ display: "flex", width: "100%" }}>
          <InfoCell label="Boarding time" value={boardingTime || "--"} />
          <InfoCell label="Seat" value={seat} />
          <InfoCell label="Class" value={cabin} />
        </div>

        <div style={{ marginTop: 32, marginBottom: 28, display: "flex" }}>
          <TicketPerforation />
        </div>

        <div
          style={{
            fontSize: 30,
            fontWeight: 500,
            color: REMI.foreground,
            textAlign: "center",
            marginBottom: 28,
            display: "flex",
            justifyContent: "center",
          }}
        >
          Boarding pass
        </div>

        <Barcode seed={barcodeSeed(data)} />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 32,
          }}
        >
          <div
            style={{
              fontSize: 24,
              color: REMI.mutedForeground,
              display: "flex",
            }}
          >
            {origin} to {destination}
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 700,
              color: REMI.primary,
              display: "flex",
            }}
          >
            remi
          </div>
        </div>
      </div>
    </div>
  );
}
