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
        padding: '80px 72px',
        justifyContent: 'space-between',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 20,
          }}
        >
          {data.logoUrl ? (
            <img
              src={data.logoUrl}
              width={72}
              height={72}
              style={{ borderRadius: 16, objectFit: 'contain' }}
            />
          ) : (
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 16,
                backgroundColor: SURFACE,
                border: `1px solid ${BORDER}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 36,
                fontWeight: 700,
                color: ACCENT,
              }}
            >
              {data.airline.charAt(0).toUpperCase()}
            </div>
          )}
          <div
            style={{
              fontSize: 44,
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
          <div style={{ color: MUTED, fontSize: 26, fontWeight: 400 }}>Total</div>
          <div
            style={{
              color: ACCENT,
              fontSize: 72,
              fontWeight: 700,
              lineHeight: 1,
              marginTop: 8,
            }}
          >
            {data.price}
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 48,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 36,
          }}
        >
          <div style={{ fontSize: 200, fontWeight: 700, lineHeight: 1, letterSpacing: -6 }}>
            {data.origin}
          </div>
          <Arrow size={96} />
          <div style={{ fontSize: 200, fontWeight: 700, lineHeight: 1, letterSpacing: -6 }}>
            {data.destination}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div style={{ fontSize: 36, fontWeight: 700, color: TEXT, letterSpacing: -0.5 }}>
            {data.duration}
          </div>
          <div style={{ fontSize: 28, color: MUTED }}>{stops}</div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 24,
            marginTop: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              minWidth: 220,
            }}
          >
            <div style={{ fontSize: 22, color: MUTED, letterSpacing: 2 }}>DEPART</div>
            <div style={{ fontSize: 40, fontWeight: 700, marginTop: 6 }}>
              {data.departureTime}
            </div>
          </div>
          <div
            style={{
              width: 1,
              height: 60,
              backgroundColor: BORDER,
            }}
          />
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              minWidth: 220,
            }}
          >
            <div style={{ fontSize: 22, color: MUTED, letterSpacing: 2 }}>ARRIVE</div>
            <div style={{ fontSize: 40, fontWeight: 700, marginTop: 6 }}>
              {data.arrivalTime}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: 32,
          borderTop: `1px solid ${BORDER}`,
        }}
      >
        <div
          style={{
            color: MUTED,
            fontSize: 26,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <span>{data.origin}</span>
          <Arrow size={36} color={MUTED} />
          <span>{data.destination}</span>
        </div>
        <div
          style={{
            color: TEXT,
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: 3,
            display: 'flex',
          }}
        >
          REMI
        </div>
      </div>
    </div>
  );
}
