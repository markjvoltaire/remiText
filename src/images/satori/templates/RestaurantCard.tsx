import type { ReactElement } from 'react';

export interface RestaurantCardInput {
  name: string;
  imageUrl?: string;
  cuisine?: string;
  neighborhood?: string;
  priceRange?: string;
  rating?: string;
  date: string;
  partySize: number;
  times: string[];
  optionLabel?: string;
}

const TICKET = '#F4F3F0';
const INK = '#050505';
const MUTED = 'rgba(0,0,0,0.6)';
const ACCENT = '#E1306C';
const IG_PURPLE = '#833AB4';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function RestaurantCard(data: RestaurantCardInput): ReactElement {
  const optionLabel = data.optionLabel ?? 'Remi pick';
  const times =
    data.times.filter(Boolean).slice(0, 3).join(' · ') || 'Check times in chat';
  const meta = [data.cuisine, data.neighborhood, data.priceRange].filter(Boolean).join(' · ');

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: TICKET,
        color: INK,
        fontFamily: 'Inter',
      }}
    >
      <div
        style={{
          height: 620,
          width: '100%',
          display: 'flex',
          backgroundColor: '#1a1a1a',
        }}
      >
        {data.imageUrl ? (
          <img
            src={data.imageUrl}
            alt=""
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: IG_PURPLE,
            }}
          >
            <div
              style={{
                fontSize: 72,
                fontWeight: 700,
                color: '#fff',
                display: 'flex',
              }}
            >
              {initials(data.name)}
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: '48px 72px 64px',
        }}
      >
        <div
          style={{
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            color: ACCENT,
            display: 'flex',
          }}
        >
          {optionLabel}
        </div>
        <div
          style={{
            fontSize: 52,
            fontWeight: 700,
            lineHeight: 1.15,
            marginTop: 16,
            display: 'flex',
          }}
        >
          {data.name}
        </div>
        {meta ? (
          <div style={{ fontSize: 28, color: MUTED, marginTop: 12, display: 'flex' }}>{meta}</div>
        ) : null}
        {data.rating ? (
          <div style={{ fontSize: 26, color: MUTED, marginTop: 8, display: 'flex' }}>{data.rating}</div>
        ) : null}
        <div
          style={{
            marginTop: 'auto',
            paddingTop: 32,
            borderTop: '2px solid rgba(0,0,0,0.1)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              fontSize: 24,
              color: MUTED,
              textTransform: 'uppercase',
              letterSpacing: 1,
              display: 'flex',
            }}
          >
            Open times
          </div>
          <div style={{ fontSize: 34, fontWeight: 700, marginTop: 10, display: 'flex' }}>{times}</div>
          <div style={{ fontSize: 26, color: MUTED, marginTop: 12, display: 'flex' }}>
            {data.date} · party of {data.partySize}
          </div>
        </div>
      </div>
    </div>
  );
}
