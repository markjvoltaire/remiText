import { createClient } from '@supabase/supabase-js';
import type {
  ConversationMessage,
  LastFlightSearchContext,
  LastRestaurantSearchContext,
  LastSentPreviewCards,
  UserProfile,
} from '../types.js';
import { normalizeContactKey } from '../utils/contactId.js';

console.log('[supabase] connecting to', process.env.SUPABASE_URL);

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/** Fails fast if dedupe table is missing (avoids silent duplicate handling). */
export async function assertSeenMessagesTableReady(): Promise<void> {
  const { error } = await supabase.from('seen_messages').select('id').limit(1);
  if (!error) return;
  throw new Error(
    `[supabase] Table seen_messages is missing or not exposed to the API (${error.message}). ` +
      `Apply supabase/migrations/20250511000000_create_seen_messages.sql in the project that matches SUPABASE_URL.`,
  );
}

export async function claimMessage(id: string): Promise<boolean> {
  const { error } = await supabase.from('seen_messages').insert({ id });
  if (!error) return true;
  if (error.code === '23505') return false; // duplicate key — already claimed
  console.error('Supabase claim error, processing anyway:', error.message);
  return true; // don't drop messages on unexpected errors
}

/** Returns true the first time we acknowledge a contact's Find My location share. */
export async function claimLocationAcknowledgment(contactKey: string): Promise<boolean> {
  const { error } = await supabase.from('location_acknowledgments').insert({ contact_key: contactKey });
  if (!error) return true;
  if (error.code === '23505') return false;
  console.error('Supabase location ack error, acknowledging anyway:', error.message);
  return true;
}

/** Silently record an existing share without sending a confirmation message. */
export async function seedLocationAcknowledgment(contactKey: string): Promise<void> {
  const { error } = await supabase
    .from('location_acknowledgments')
    .upsert({ contact_key: contactKey }, { onConflict: 'contact_key', ignoreDuplicates: true });
  if (error) {
    console.warn(`Supabase location seed error contact=${contactKey}:`, error.message);
  }
}

export async function getUserByPhone(phone: string): Promise<UserProfile | null> {
  const trimmed = phone.trim();
  const normalized = normalizeContactKey(trimmed);
  const keys = [...new Set([normalized, trimmed].filter(Boolean))];

  for (const key of keys) {
    const { data, error } = await supabase.from('users').select('*').eq('phone', key).maybeSingle();
    if (!error && data) return data as UserProfile;
  }
  return null;
}

export async function getConversationHistory(userId: string): Promise<ConversationMessage[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select('role, content')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(40);

  if (error || !data) return [];
  return (data as ConversationMessage[]).slice().reverse();
}

const CONVERSATION_LOG_MAX_CHARS = Math.max(
  200,
  Math.min(4000, Number.parseInt(process.env.REMI_CONVERSATION_LOG_MAX_CHARS ?? '2000', 10) || 2000),
);

function logConversationToRender(userId: string, role: 'user' | 'assistant', content: string): void {
  const text =
    content.length > CONVERSATION_LOG_MAX_CHARS
      ? `${content.slice(0, CONVERSATION_LOG_MAX_CHARS)}…`
      : content;
  console.log(
    '[conversation]',
    JSON.stringify({
      user_id: userId,
      role,
      chars: content.length,
      text,
    }),
  );
}

export async function appendMessage(
  userId: string,
  role: 'user' | 'assistant',
  content: string,
): Promise<void> {
  logConversationToRender(userId, role, content);
  await supabase.from('conversations').insert({ user_id: userId, role, content });
}

export async function setLastFlightSearch(
  userId: string,
  ctx: LastFlightSearchContext,
): Promise<void> {
  await supabase.from('users').update({ last_flight_search: ctx }).eq('id', userId);
}

export async function clearLastFlightSearch(userId: string): Promise<void> {
  await supabase.from('users').update({ last_flight_search: null }).eq('id', userId);
}

export async function setLastRestaurantSearch(
  userId: string,
  ctx: LastRestaurantSearchContext,
): Promise<boolean> {
  const { error } = await supabase.from('users').update({ last_restaurant_search: ctx }).eq('id', userId);
  if (error) {
    console.warn(`[supabase] setLastRestaurantSearch failed user=${userId}:`, error.message);
    return false;
  }
  return true;
}

export async function clearLastRestaurantSearch(userId: string): Promise<void> {
  await supabase.from('users').update({ last_restaurant_search: null }).eq('id', userId);
}

export async function setLastSentPreviewCards(
  userId: string,
  cards: LastSentPreviewCards,
): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ last_sent_preview_cards: cards })
    .eq('id', userId);
  if (error) {
    console.warn(`[supabase] setLastSentPreviewCards failed user=${userId}:`, error.message);
  }
}

export async function setPendingOrder(params: {
  userId: string;
  orderId: string;
  bookingReference: string;
  amount: string;
  currency: string;
  duffelPayload?: Record<string, unknown>;
}): Promise<void> {
  await supabase
    .from('users')
    .update({
      pending_order_id: params.orderId,
      pending_booking_reference: params.bookingReference,
      pending_order_amount: params.amount,
      pending_order_currency: params.currency,
      pending_duffel_order: params.duffelPayload ?? null,
    })
    .eq('id', params.userId);
}

export async function clearPendingOrder(userId: string): Promise<void> {
  await supabase
    .from('users')
    .update({
      pending_order_id: null,
      pending_booking_reference: null,
      pending_order_amount: null,
      pending_order_currency: null,
      pending_duffel_order: null,
    })
    .eq('id', userId);
}
