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

const TICKET = "#F4F3F0";
const INK = "#050505";
const MUTED = "rgba(0,0,0,0.6)";
const LINE = "rgba(0,0,0,0.16)";
const ACCENT = "#E1306C";
const IG_ORANGE = "#F77737";
const IG_YELLOW = "#FCAF45";
const IG_PURPLE = "#833AB4";
const IG_BLUE = "#405DE6";

function stopsLabel(stops?: number): string {
  if (stops == null) return "Nonstop";
  if (stops <= 0) return "Nonstop";
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

function PlaneIcon({
  size = 52,
  color = INK,
}: {
  size?: number;
  color?: string;
}): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block" }}
    >
      <path
        d="M58 31.5c0 2.1-1.7 3.7-3.8 3.7H39.4L28.2 53.5h-5.1l5.2-18.3H16.6l-4.2 5.4H8.2l2.4-9.1-2.4-9.1h4.2l4.2 5.4h11.7L23.1 9.5h5.1l11.2 18.3h14.8c2.1 0 3.8 1.6 3.8 3.7Z"
        fill={color}
      />
    </svg>
  );
}

function MiniArrow({
  size = 36,
  color = MUTED,
}: {
  size?: number;
  color?: string;
}): ReactElement {
  const stroke = Math.max(2, Math.round(size / 12));
  return (
    <svg
      width={size}
      height={size / 2}
      viewBox="0 0 56 28"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block" }}
    >
      <path
        d="M4 14 L48 14 M38 5 L50 14 L38 23"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function DetailItem({
  value,
  label,
  align = "center",
  width = 160,
}: {
  value: string;
  label: string;
  align?: "flex-start" | "center" | "flex-end";
  width?: number;
}): ReactElement {
  return (
    <div
      style={{
        width,
        display: "flex",
        flexDirection: "column",
        alignItems: align,
      }}
    >
      <div
        style={{
          color: MUTED,
          fontSize: 34,
          fontWeight: 400,
          lineHeight: 1.1,
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
      <div
        style={{
          color: INK,
          fontSize: 28,
          fontWeight: 700,
          lineHeight: 1.25,
          marginTop: 6,
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </div>
    </div>
  );
}

export function FlightCard(data: FlightCardInput): ReactElement {
  const stops = stopsLabel(data.stops);
  const cabinClass = data.cabinClass ?? "Economy";
  const date = data.date ?? "Flight option";
  const flightNumber = data.flightNumber ?? "Flight";
  const optionLabel = data.optionLabel ?? "Remi flight";
  const hasLogo = Boolean(data.logoUrl);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        backgroundColor: TICKET,
        color: INK,
        fontFamily: "Inter",
        position: "relative",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          backgroundColor: TICKET,
          padding: "86px 80px 72px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 18,
            display: "flex",
          }}
        >
          <div style={{ flex: 1, backgroundColor: IG_YELLOW }} />
          <div style={{ flex: 1, backgroundColor: IG_ORANGE }} />
          <div style={{ flex: 1, backgroundColor: ACCENT }} />
          <div style={{ flex: 1, backgroundColor: IG_PURPLE }} />
          <div style={{ flex: 1, backgroundColor: IG_BLUE }} />
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 10,
            display: "flex",
            opacity: 0.95,
          }}
        >
          <div style={{ flex: 1, backgroundColor: IG_BLUE }} />
          <div style={{ flex: 1, backgroundColor: IG_PURPLE }} />
          <div style={{ flex: 1, backgroundColor: ACCENT }} />
          <div style={{ flex: 1, backgroundColor: IG_ORANGE }} />
          <div style={{ flex: 1, backgroundColor: IG_YELLOW }} />
        </div>
        <div
          style={{
            position: "absolute",
            top: 18,
            right: 0,
            width: 178,
            height: 178,
            borderBottomLeftRadius: 178,
            backgroundColor: IG_YELLOW,
            opacity: 0.12,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 92,
            right: 28,
            width: 126,
            height: 126,
            borderRadius: "50%",
            backgroundColor: ACCENT,
            opacity: 0.08,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: -34,
            top: 548,
            width: 68,
            height: 68,
            borderRadius: "50%",
            backgroundColor: IG_PURPLE,
          }}
        />
        <div
          style={{
            position: "absolute",
            right: -34,
            top: 548,
            width: 68,
            height: 68,
            borderRadius: "50%",
            backgroundColor: IG_ORANGE,
          }}
        />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                alignSelf: "flex-start",
                padding: "12px 22px",
                borderRadius: 999,
                border: `2px solid ${LINE}`,
                color: MUTED,
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: 2,
                textTransform: "uppercase",
              }}
            >
              {optionLabel}
            </div>
            <div
              style={{
                color: MUTED,
                fontSize: 34,
                fontWeight: 400,
                marginTop: 26,
              }}
            >
              Boarding pass
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
            }}
          >
            <div style={{ color: MUTED, fontSize: 34, fontWeight: 400 }}>
              Total
            </div>
            <div
              style={{
                color: ACCENT,
                fontSize: 96,
                fontWeight: 700,
                lineHeight: 0.95,
                marginTop: 6,
              }}
            >
              {data.price}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 122,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <div
              style={{
                width: 270,
                display: "flex",
                flexDirection: "column",
                alignItems: hasLogo ? "flex-start" : "center",
              }}
            >
              {data.logoUrl ? (
                <img
                  src={data.logoUrl}
                  width={250}
                  height={82}
                  style={{ objectFit: "contain" }}
                />
              ) : (
                <div
                  style={{
                    width: 74,
                    height: 74,
                    borderRadius: "50%",
                    backgroundColor: ACCENT,
                    color: "#FFFFFF",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 30,
                    fontWeight: 700,
                    letterSpacing: -0.5,
                  }}
                >
                  {airlineInitials(data.airline)}
                </div>
              )}
              {!hasLogo ? (
                <div
                  style={{
                    color: INK,
                    fontSize: 30,
                    fontWeight: 700,
                    marginTop: 16,
                    textAlign: "center",
                    lineHeight: 1.1,
                  }}
                >
                  {data.airline}
                </div>
              ) : null}
            </div>
            <div
              style={{
                color: INK,
                fontSize: 38,
                fontWeight: 400,
                marginTop: 24,
                textAlign: "right",
              }}
            >
              {date}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 132,
            }}
          >
            <div
              style={{
                width: 285,
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
              }}
            >
              <div
                style={{
                  fontSize: 66,
                  fontWeight: 700,
                  lineHeight: 1,
                  letterSpacing: -1,
                }}
              >
                {data.departureTime}
              </div>
              <div
                style={{
                  color: MUTED,
                  fontSize: 56,
                  fontWeight: 700,
                  lineHeight: 1.15,
                  marginTop: 10,
                }}
              >
                {data.origin}
              </div>
            </div>

            <div
              style={{
                width: 300,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <PlaneIcon size={78} />
              <div
                style={{
                  color: INK,
                  fontSize: 38,
                  fontWeight: 400,
                  lineHeight: 1.1,
                  marginTop: 13,
                  textAlign: "center",
                }}
              >
                {data.duration}
              </div>
              <div
                style={{
                  color: INK,
                  fontSize: 38,
                  fontWeight: 400,
                  lineHeight: 1.1,
                  marginTop: 4,
                  textAlign: "center",
                }}
              >
                {stops}
              </div>
            </div>

            <div
              style={{
                width: 285,
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
              }}
            >
              <div
                style={{
                  fontSize: 66,
                  fontWeight: 700,
                  lineHeight: 1,
                  letterSpacing: -1,
                }}
              >
                {data.arrivalTime}
              </div>
              <div
                style={{
                  color: MUTED,
                  fontSize: 56,
                  fontWeight: 700,
                  lineHeight: 1.15,
                  marginTop: 10,
                }}
              >
                {data.destination}
              </div>
            </div>
          </div>

          <div
            style={{
              height: 2,
              backgroundColor: LINE,
              marginTop: 110,
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 62,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <DetailItem
              value={cabinClass}
              label="Class"
              align="flex-start"
              width={214}
            />
            <DetailItem
              value={data.gate ?? stops}
              label={data.gate ? "Gate" : "Stops"}
              width={214}
            />
            <DetailItem
              value={data.terminal ?? data.origin}
              label={data.terminal ? "Terminal" : "From"}
              width={214}
            />
            <DetailItem
              value={flightNumber}
              label="Flight"
              align="flex-end"
              width={244}
            />
          </div>
          <div
            style={{
              height: 2,
              backgroundColor: LINE,
              marginTop: 58,
            }}
          />
        </div>

        <div
          style={{
            marginTop: "auto",
            alignItems: "center",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              color: MUTED,
              display: "flex",
              alignItems: "center",
              gap: 16,
              fontSize: 36,
              fontWeight: 400,
            }}
          >
            <span>{data.origin}</span>
            <MiniArrow size={38} />
            <span>{data.destination}</span>
          </div>
          <div
            style={{
              color: INK,
              display: "flex",
              fontSize: 38,
              fontWeight: 700,
              letterSpacing: 4,
            }}
          >
            REMI
          </div>
        </div>
      </div>
    </div>
  );
}
