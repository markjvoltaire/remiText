/** Shared plain-text SMS formatting — editorial, human-readable (no ISO dates or API phrasing). */

/** YYYY-MM-DD → "Fri, May 29" (noon UTC avoids timezone day shift). */
export function formatHumanDate(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatPartySize(partySize: number): string {
  if (partySize === 1) return 'for 1';
  return `for ${partySize}`;
}

/** "3:00 PM" → "3:00p" to match flight copy. */
export function compactTime(raw: string): string {
  const s = raw.trim();
  const m12 = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m12) {
    const h = parseInt(m12[1]!, 10);
    const min = m12[2]!;
    const suffix = m12[3]!.toUpperCase() === 'AM' ? 'a' : 'p';
    const h12 = h % 12 || 12;
    return `${h12}:${min}${suffix}`;
  }
  return s;
}

export function formatPriceRange(priceRange: number): string {
  if (!priceRange || priceRange < 1) return '';
  return '$'.repeat(Math.min(priceRange, 4));
}

/** Middle-dot header line for search results. */
export function formatSearchHeader(parts: string[]): string {
  return parts.filter(Boolean).join(' · ');
}
