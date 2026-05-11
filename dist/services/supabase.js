import { createClient } from '@supabase/supabase-js';
import { normalizeContactKey } from '../utils/contactId.js';
console.log('[supabase] connecting to', process.env.SUPABASE_URL);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
/** Fails fast if dedupe table is missing (avoids silent duplicate handling). */
export async function assertSeenMessagesTableReady() {
    const { error } = await supabase.from('seen_messages').select('id').limit(1);
    if (!error)
        return;
    throw new Error(`[supabase] Table seen_messages is missing or not exposed to the API (${error.message}). ` +
        `Apply supabase/migrations/20250511000000_create_seen_messages.sql in the project that matches SUPABASE_URL.`);
}
export async function claimMessage(id) {
    const { error } = await supabase.from('seen_messages').insert({ id });
    if (!error)
        return true;
    if (error.code === '23505')
        return false; // duplicate key — already claimed
    console.error('Supabase claim error, processing anyway:', error.message);
    return true; // don't drop messages on unexpected errors
}
export async function getUserByPhone(phone) {
    const trimmed = phone.trim();
    const normalized = normalizeContactKey(trimmed);
    const keys = [...new Set([normalized, trimmed].filter(Boolean))];
    for (const key of keys) {
        const { data, error } = await supabase.from('users').select('*').eq('phone', key).maybeSingle();
        if (!error && data)
            return data;
    }
    return null;
}
export async function getConversationHistory(userId) {
    const { data, error } = await supabase
        .from('conversations')
        .select('role, content')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(40);
    if (error || !data)
        return [];
    return data.slice().reverse();
}
export async function appendMessage(userId, role, content) {
    await supabase.from('conversations').insert({ user_id: userId, role, content });
}
export async function setLastFlightSearch(userId, ctx) {
    await supabase.from('users').update({ last_flight_search: ctx }).eq('id', userId);
}
export async function clearLastFlightSearch(userId) {
    await supabase.from('users').update({ last_flight_search: null }).eq('id', userId);
}
export async function setPendingOrder(params) {
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
export async function clearPendingOrder(userId) {
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
