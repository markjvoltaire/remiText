import { createClient } from '@supabase/supabase-js';
import type { UserProfile } from '../types.js';
import { normalizeContactKey } from '../utils/contactId.js';
import { buildSignupUrl } from '../utils/signupUrl.js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type OnboardingStep = 'first_name' | 'last_name' | 'email' | 'city';

export interface OnboardingSession {
  phone: string;
  step: OnboardingStep;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  city: string | null;
}

const GREETING_TOKENS = new Set([
  'hi',
  'hey',
  'hello',
  'hiya',
  'yo',
  'sup',
  'howdy',
  'heya',
  'hola',
  'thanks',
  'thank',
  'you',
  'ok',
  'okay',
  'yes',
  'no',
  'test',
]);

function normalizePersonName(raw: string): string | null {
  const name = raw.replace(/\s+/g, ' ').trim();
  if (name.length < 2) return null;
  if (GREETING_TOKENS.has(name.toLowerCase())) return null;
  if (!/^[\p{L}\p{M}'-]+$/u.test(name)) return null;
  return name;
}

function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function normalizeCity(raw: string): string | null {
  const city = raw.replace(/\s+/g, ' ').trim();
  if (city.length < 2) return null;
  if (GREETING_TOKENS.has(city.toLowerCase())) return null;
  return city;
}

function parseStep(raw: string | null | undefined): OnboardingStep {
  if (raw === 'last_name' || raw === 'email' || raw === 'city') return raw;
  if (raw === 'name') return 'first_name';
  return 'first_name';
}

export function isLinkWalletConnected(user: UserProfile): boolean {
  return Boolean(user.link_connected_at || user.link_auth_json);
}

export async function getOnboardingSession(phone: string): Promise<OnboardingSession | null> {
  const { data, error } = await supabase
    .from('onboarding_sessions')
    .select('phone, step, first_name, last_name, email, city, name')
    .eq('phone', phone)
    .maybeSingle();
  if (error || !data) return null;

  const legacyFirst =
    data.first_name ??
    (typeof data.name === 'string' ? data.name.trim().split(/\s+/)[0] : null) ??
    null;

  return {
    phone: data.phone,
    step: parseStep(data.step),
    first_name: legacyFirst,
    last_name: data.last_name ?? null,
    email: data.email ?? null,
    city: data.city ?? null,
  };
}

export async function startOnboarding(phone: string): Promise<OnboardingSession> {
  const { data, error } = await supabase
    .from('onboarding_sessions')
    .upsert(
      {
        phone,
        step: 'first_name',
        first_name: null,
        last_name: null,
        email: null,
        city: null,
      },
      { onConflict: 'phone' },
    )
    .select('phone, step, first_name, last_name, email, city')
    .single();
  if (error) throw error;
  return {
    phone: data.phone,
    step: parseStep(data.step),
    first_name: data.first_name ?? null,
    last_name: data.last_name ?? null,
    email: data.email ?? null,
    city: data.city ?? null,
  };
}

async function createUserAwaitingLink(params: {
  phone: string;
  firstName: string;
  lastName: string;
  email: string;
  city: string;
}): Promise<UserProfile> {
  const canonicalPhone = normalizeContactKey(params.phone);
  const fullName = `${params.firstName} ${params.lastName}`.trim();

  const profile = {
    phone: canonicalPhone,
    name: fullName,
    email: params.email,
    city: params.city,
    date_of_birth: '1990-01-01',
    gender: 'm' as const,
    passport_number: null,
    stripe_customer_id: null,
    stripe_spt_id: null,
  };

  const { data: inserted, error: insertError } = await supabase
    .from('users')
    .insert(profile)
    .select('*')
    .single();

  if (insertError) {
    const { data: existing } = await supabase
      .from('users')
      .select('*')
      .eq('phone', canonicalPhone)
      .maybeSingle();
    if (!existing) throw insertError;
    await supabase
      .from('users')
      .update({ name: fullName, email: params.email, city: params.city })
      .eq('id', existing.id);
    const { data: refreshed } = await supabase
      .from('users')
      .select('*')
      .eq('id', existing.id)
      .single();
    return refreshed as UserProfile;
  }

  return inserted as UserProfile;
}

export async function advanceOnboarding(
  session: OnboardingSession,
  inboundText: string,
): Promise<
  | { kind: 'prompt'; message: string }
  | { kind: 'awaiting_link'; message: string }
  | { kind: 'completed'; user: UserProfile }
> {
  const text = inboundText.trim();

  if (session.step === 'first_name') {
    const first_name = normalizePersonName(text);
    if (!first_name) {
      return { kind: 'prompt', message: "What's your first name?" };
    }
    await supabase
      .from('onboarding_sessions')
      .update({ first_name, step: 'last_name' })
      .eq('phone', session.phone);
    return { kind: 'prompt', message: 'And your last name?' };
  }

  if (session.step === 'last_name') {
    const last_name = normalizePersonName(text);
    if (!last_name) {
      return { kind: 'prompt', message: 'And your last name?' };
    }
    await supabase
      .from('onboarding_sessions')
      .update({ last_name, step: 'email' })
      .eq('phone', session.phone);
    return { kind: 'prompt', message: "What's your email?" };
  }

  if (session.step === 'email') {
    const email = normalizeEmail(text);
    if (!email) {
      return { kind: 'prompt', message: 'Send a valid email (e.g. you@example.com).' };
    }
    await supabase
      .from('onboarding_sessions')
      .update({ email, step: 'city' })
      .eq('phone', session.phone);
    return { kind: 'prompt', message: 'What city are you in?' };
  }

  const city = normalizeCity(text);
  if (!city) {
    return { kind: 'prompt', message: 'What city are you in? (e.g. New York, Miami)' };
  }

  const latest = await getOnboardingSession(session.phone);
  if (!latest?.first_name || !latest.last_name || !latest.email) {
    return { kind: 'prompt', message: "What's your first name?" };
  }

  await supabase.from('onboarding_sessions').update({ city }).eq('phone', session.phone);

  const user = await createUserAwaitingLink({
    phone: latest.phone,
    firstName: latest.first_name,
    lastName: latest.last_name,
    email: latest.email,
    city,
  });

  await supabase.from('onboarding_sessions').delete().eq('phone', latest.phone);

  const signupUrl = buildSignupUrl(user.phone);
  const first = latest.first_name;

  return {
    kind: 'awaiting_link',
    message:
      `thanks, ${first}.\n\n` +
      `last step — connect your payment with Link (takes about a minute):\n${signupUrl}\n\n` +
      `text me when you're done.`,
  };
}

export function linkSetupReminderMessage(phone: string): string {
  const url = buildSignupUrl(phone);
  return `you still need to connect Link before we can book anything:\n${url}`;
}
