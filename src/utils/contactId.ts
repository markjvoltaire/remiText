/**
 * Normalizes Photon / Spectrum sender identifiers for DB lookup and outbound send.
 * See project `.agents/skills/imessage` (Photon iMessage skill) — E.164 and chatGuid formats.
 */

const CHAT_GUID_SUFFIX = /^(?:iMessage|SMS|RCS|any);[^;]+;(.+)$/i;

function stripChatServicePrefix(id: string): string {
  const t = id.trim();
  const m = t.match(CHAT_GUID_SUFFIX);
  return m ? m[1].trim() : t;
}

function isLikelyEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/** True when the local part has letters other than a leading + (opaque handle / chat id). */
function hasNonPhoneLetters(s: string): boolean {
  const withoutPlus = s.startsWith('+') ? s.slice(1) : s;
  return /[a-z]/i.test(withoutPlus);
}

export function toE164(phone: string, defaultCountryCode = '1'): string {
  const raw = phone.trim();
  const digits = raw.replace(/\D/g, '');

  if (raw.startsWith('+')) return `+${digits}`;
  if (raw.startsWith('00')) return `+${digits.slice(2)}`;
  if (digits.length === 10) return `+${defaultCountryCode}${digits}`;
  if (digits.length === 11 && digits.startsWith(defaultCountryCode)) return `+${digits}`;

  throw new Error(`Cannot normalize to E.164: ${phone}`);
}

export function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone);
}

/**
 * Canonical key for `users.phone` / onboarding: lowercased email, E.164 phone,
 * or unchanged opaque ids (e.g. some group-related handles).
 */
export function normalizeContactKey(
  raw: string,
  defaultCountryCode = process.env.DEFAULT_PHONE_COUNTRY_CODE ?? '1',
): string {
  const stripped = stripChatServicePrefix(raw);
  if (!stripped) return stripped;
  if (isLikelyEmail(stripped)) return stripped.toLowerCase();
  if (hasNonPhoneLetters(stripped)) return stripped;

  try {
    const e164 = toE164(stripped, defaultCountryCode);
    return isValidE164(e164) ? e164 : stripped;
  } catch {
    return stripped;
  }
}
