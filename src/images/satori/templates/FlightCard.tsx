import type { ReactElement } from 'react';

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
}

const BG = '#0B0F19';
const SURFACE = '#111726';
const BORDER = '#1F2937';
const TEXT = '#F9FAFB';
const MUTED = '#9CA3AF';
const ACCENT = '#34D399';

function stopsLabel(stops?: number): string {
  if (stops == null) return 'Nonstop';
  if (stops <= 0) return 'Nonstop';
  if (stops === 1) return '1 stop';
  return `${stops} stops`;
}

function Arrow({ size = 56, color = TEXT }: { size?: number; color?: string }): ReactElement {
  const stroke = Math.max(3, Math.round(size / 14));
  return (
    <svg
      width={size}
      height={size / 2}
      viewBox="0 0 56 28"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      <path
        d="M2 14 L48 14 M36 4 L50 14 L36 24"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function FlightCard(data: FlightCardInput): ReactElement {
  const stops = stopsLabel(data.stops);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: BG,
        color: TEXT,
        fontFamily: 'Inter',
        padding: '64px 72px',
        justifyContent: 'space-between',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          {data.logoUrl ? (
            <img
              src={data.logoUrl}
              width={56}
              height={56}
              style={{ borderRadius: 12, objectFit: 'contain' }}
            />
          ) : (
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 12,
                backgroundColor: SURFACE,
                border: `1px solid ${BORDER}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 28,
                fontWeight: 700,
                color: ACCENT,
              }}
            >
              {data.airline.charAt(0).toUpperCase()}
            </div>
          )}
          <div
            style={{
              fontSize: 38,
              fontWeight: 700,
              letterSpacing: -0.5,
            }}
          >
            {data.airline}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
          }}
        >
          <div style={{ color: MUTED, fontSize: 22, fontWeight: 400 }}>Total</div>
          <div
            style={{
              color: ACCENT,
              fontSize: 56,
              fontWeight: 700,
              lineHeight: 1,
              marginTop: 6,
            }}
          >
            {data.price}
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 40,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: 140, fontWeight: 700, lineHeight: 1, letterSpacing: -4 }}>
            {data.origin}
          </div>
          <div style={{ color: MUTED, fontSize: 26, marginTop: 12 }}>
            {data.departureTime}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            color: MUTED,
            paddingBottom: 36,
          }}
        >
          <Arrow size={72} />
          <div style={{ fontSize: 22, marginTop: 16, fontWeight: 700, color: TEXT }}>
            {data.duration}
          </div>
          <div style={{ fontSize: 20, marginTop: 4 }}>{stops}</div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: 140, fontWeight: 700, lineHeight: 1, letterSpacing: -4 }}>
            {data.destination}
          </div>
          <div style={{ color: MUTED, fontSize: 26, marginTop: 12 }}>
            {data.arrivalTime}
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: 28,
          borderTop: `1px solid ${BORDER}`,
        }}
      >
        <div
          style={{
            color: MUTED,
            fontSize: 22,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span>{data.origin}</span>
          <Arrow size={32} color={MUTED} />
          <span>{data.destination}</span>
        </div>
        <div
          style={{
            color: TEXT,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 2,
            display: 'flex',
          }}
        >
          REMI
        </div>
      </div>
    </div>
  );
}
