/** True when mood is too generic to run a paid TikTok/Instagram search. */
export function isVagueSocialVibe(vibe: string | undefined): boolean {
  const v = vibe?.trim().toLowerCase() ?? '';
  if (!v || v.length < 4) return true;

  const vague =
    /^(something fun|things to do|what'?s good|what to do|fun|cool|good spots?|recommendations?|ideas?|stuff|activities?|weekend plans?|night out|going out|hang out|explore|discover|local tips)$/;
  if (vague.test(v)) return true;

  if (/^fun in /.test(v) || /^something in /.test(v)) return true;

  return false;
}

/** Slim social post for Claude to synthesize into 2–3 iMessage recommendations. */

export type SocialItemType = 'venue' | 'event' | 'other';

export interface SocialTrendItem {
  name: string;
  type: SocialItemType;
  hook: string;
  neighborhood?: string;
  when?: string;
  engagement?: string;
}

/** Strip platform names, @handles, and ticket-site promos before the model writes the SMS. */
export function sanitizeSocialHook(text: string): string {
  let s = text.replace(/\s+/g, ' ').trim();
  s = s.replace(/@[A-Za-z0-9_.]+/g, '');
  s = s.replace(/#linkinbio\b/gi, '');
  s = s.replace(
    /\b(tiktok|instagram|ig\b|crowdvolt|eventbrite|dice\.fm|posh\.vip|shotgun|ra\.co|linktree|linktr\.ee)\b/gi,
    '',
  );
  s = s.replace(/https?:\/\/\S+/g, '');
  s = s.replace(/\s{2,}/g, ' ').trim();
  return s;
}

const EVENT_HINTS =
  /\b(party|parties|concert|festival|pop-?up|rooftop|dj|live music|memorial day|this weekend|saturday|sunday|friday night|tonight|tickets|starts at|doors at|event)\b/i;

const VENUE_HINTS =
  /\b(restaurant|bar|club|lounge|brunch|dinner|tacos|steakhouse|hotel|rooftop bar|speakeasy|café|cafe|kitchen|grill|bistro)\b/i;

function classifyType(text: string): SocialItemType {
  if (EVENT_HINTS.test(text)) return 'event';
  if (VENUE_HINTS.test(text)) return 'venue';
  return 'other';
}

function extractName(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Trending spot';

  const atVenue = cleaned.match(
    /\b(?:at|@)\s+([A-Z][A-Za-z0-9'&.\- ]{2,40}?)(?:\s+[-–—,]|$)/,
  );
  if (atVenue?.[1]) return atVenue[1].trim().slice(0, 60);

  const dashVenue = cleaned.match(/^([A-Z][A-Za-z0-9'&.\- ]{2,35})\s+[-–—]/);
  if (dashVenue?.[1]) return dashVenue[1].trim();

  const firstChunk = cleaned.split(/[.!?\n]/)[0]?.trim() ?? cleaned;
  return firstChunk.slice(0, 55) || 'Trending spot';
}

function formatEngagement(views?: number, likes?: number, comments?: number): string | undefined {
  const v = views && views > 0 ? views : undefined;
  const l = likes && likes > 0 ? likes : undefined;
  if (v && v >= 1000) return `${Math.round(v / 1000)}k views`;
  if (v) return `${v} views`;
  if (l && l >= 1000) return `${Math.round(l / 1000)}k likes`;
  if (l) return `${l} likes`;
  if (comments && comments > 0) return `${comments} comments`;
  return undefined;
}

function tiktokToItems(raw: unknown[]): SocialTrendItem[] {
  const items: SocialTrendItem[] = [];

  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const post = row as Record<string, unknown>;
    const title = String(post.title ?? '').trim();
    if (!title) continue;

    const poi = post.poi as Record<string, unknown> | undefined;
    const neighborhood =
      (poi?.poiName as string) ||
      (poi?.cityName as string) ||
      undefined;

    const uploaded = post.uploadedAtFormatted as string | undefined;
    const type = classifyType(title);
    const name = extractName(title);

    items.push({
      name,
      type,
      hook: sanitizeSocialHook(title).slice(0, 220),
      neighborhood,
      when: type === 'event' ? uploaded : undefined,
      engagement: formatEngagement(
        post.views as number | undefined,
        post.likes as number | undefined,
        post.comments as number | undefined,
      ),
    });
  }

  return items.sort((a, b) => scoreItem(b) - scoreItem(a));
}

function instagramToItems(raw: unknown[]): SocialTrendItem[] {
  const items: SocialTrendItem[] = [];

  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const post = row as Record<string, unknown>;
    const caption = String(post.caption ?? '').trim();
    if (!caption) continue;

    const locationName = post.locationName as string | undefined;
    const timestamp = post.timestamp as string | undefined;
    const type = classifyType(caption);
    const name = extractName(caption) || (post.ownerUsername as string) || 'Trending spot';

    items.push({
      name,
      type,
      hook: sanitizeSocialHook(caption).slice(0, 220),
      neighborhood: locationName,
      when: type === 'event' ? timestamp : undefined,
      engagement: formatEngagement(
        undefined,
        post.likesCount as number | undefined,
        post.commentsCount as number | undefined,
      ),
    });
  }

  return items.sort((a, b) => scoreItem(b) - scoreItem(a));
}

function scoreItem(item: SocialTrendItem): number {
  let score = 0;
  if (item.type === 'venue') score += 3;
  if (item.type === 'event') score += 2;
  if (item.engagement?.includes('k')) score += 2;
  if (item.neighborhood) score += 1;
  return score;
}

export interface SocialDiscoveryToolPayload {
  location: string;
  vibe?: string;
  items: SocialTrendItem[];
  both_empty: boolean;
  fallback_message: string;
  guidance: string;
}

export function formatSocialDiscoveryForTool(result: {
  location: string;
  vibe?: string;
  tiktok: { items: unknown[]; empty: boolean };
  instagram: { items: unknown[]; empty: boolean };
  both_empty: boolean;
}): SocialDiscoveryToolPayload {
  const tiktokItems = tiktokToItems(result.tiktok.items).slice(0, 6);
  const igItems = instagramToItems(result.instagram.items).slice(0, 6);

  const merged: SocialTrendItem[] = [];
  const seen = new Set<string>();
  for (const item of [...tiktokItems, ...igItems]) {
    const key = item.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }

  const ranked = merged.sort((a, b) => scoreItem(b) - scoreItem(a)).slice(0, 12);

  return {
    location: result.location,
    vibe: result.vibe,
    items: ranked,
    both_empty: result.both_empty,
    fallback_message:
      'Nothing trending there right now — want me to search somewhere specific?',
    guidance:
      'Synthesize at most 2-3 recommendations for the user. Venue: one line with name, why it is trending, neighborhood. Event: name, date/time, location. Plain SMS — no lists of raw posts. Never mention TikTok, Instagram, CrowdVolt, Eventbrite, @handles, or other apps/sites. Never suggest booking after a social discovery reply. If the user later asks to book a venue you mentioned, ask how many people and what time, then use search_restaurants.',
  };
}
