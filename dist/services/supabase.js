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
/** Returns true the first time we acknowledge a contact's Find My location share. */
export async function claimLocationAcknowledgment(contactKey) {
    const { error } = await supabase.from('location_acknowledgments').insert({ contact_key: contactKey });
    if (!error)
        return true;
    if (error.code === '23505')
        return false;
    console.error('Supabase location ack error, acknowledging anyway:', error.message);
    return true;
}
/** Silently record an existing share without sending a confirmation message. */
export async function seedLocationAcknowledgment(contactKey) {
    const { error } = await supabase
        .from('location_acknowledgments')
        .upsert({ contact_key: contactKey }, { onConflict: 'contact_key', ignoreDuplicates: true });
    if (error) {
        console.warn(`Supabase location seed error contact=${contactKey}:`, error.message);
    }
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
const CONVERSATION_LOG_ENABLED = process.env.REMI_CONVERSATION_LOG !== '0';
const SESSION_LOG_ENABLED = process.env.REMI_SESSION_LOG !== '0';
const CONVERSATION_LOG_MAX_CHARS = Math.max(200, Math.min(4000, Number.parseInt(process.env.REMI_CONVERSATION_LOG_MAX_CHARS ?? '2000', 10) || 2000));
function logConversationToRender(userId, role, content) {
    if (!CONVERSATION_LOG_ENABLED)
        return;
    // Session logs already print full turn detail; skip duplicate JSON blobs unless requested.
    if (SESSION_LOG_ENABLED) {
        console.log(`[conversation] ${role} user=${userId.slice(0, 8)} chars=${content.length}`);
        return;
    }
    const text = content.length > CONVERSATION_LOG_MAX_CHARS
        ? `${content.slice(0, CONVERSATION_LOG_MAX_CHARS)}…`
        : content;
    console.log('[conversation]', JSON.stringify({
        user_id: userId,
        role,
        chars: content.length,
        text,
    }));
}
export async function appendMessage(userId, role, content) {
    logConversationToRender(userId, role, content);
    await supabase.from('conversations').insert({ user_id: userId, role, content });
}
export async function setLastFlightSearch(userId, ctx) {
    await supabase.from('users').update({ last_flight_search: ctx }).eq('id', userId);
}
export async function clearLastFlightSearch(userId) {
    await supabase.from('users').update({ last_flight_search: null }).eq('id', userId);
}
export async function setLastRestaurantSearch(userId, ctx) {
    const { error } = await supabase.from('users').update({ last_restaurant_search: ctx }).eq('id', userId);
    if (error) {
        console.warn(`[supabase] setLastRestaurantSearch failed user=${userId}:`, error.message);
        return false;
    }
    return true;
}
export async function clearLastRestaurantSearch(userId) {
    await supabase.from('users').update({ last_restaurant_search: null }).eq('id', userId);
}
export async function setLastSentPreviewCards(userId, cards) {
    const { error } = await supabase
        .from('users')
        .update({ last_sent_preview_cards: cards })
        .eq('id', userId);
    if (error) {
        console.warn(`[supabase] setLastSentPreviewCards failed user=${userId}:`, error.message);
    }
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
export async function saveFlightBooking(params) {
    const { data, error } = await supabase
        .from('flight_bookings')
        .insert({
        user_id: params.userId,
        status: params.status,
        booking_reference: params.bookingReference,
        duffel_order_id: params.duffelOrderId,
        duffel_offer_id: params.duffelOfferId ?? null,
        origin: params.origin ?? null,
        destination: params.destination ?? null,
        departure_date: params.departureDate ?? null,
        return_date: params.returnDate ?? null,
        airline: params.airline ?? null,
        total_amount: params.totalAmount ?? null,
        total_currency: params.totalCurrency ?? null,
        stripe_payment_intent_id: params.stripePaymentIntentId ?? null,
        metadata: params.metadata ?? null,
    })
        .select('id')
        .single();
    if (error) {
        console.warn(`[supabase] saveFlightBooking failed user=${params.userId} order=${params.duffelOrderId}:`, error.message);
        return null;
    }
    console.log(`[supabase] flight_booking saved id=${data.id} user=${params.userId} status=${params.status} ref=${params.bookingReference}`);
    return data.id;
}
/** Mark a held flight as paid/confirmed after confirm_booking or book_flight on a prior hold. */
export async function confirmFlightBooking(params) {
    const { error } = await supabase
        .from('flight_bookings')
        .update({
        status: 'confirmed',
        stripe_payment_intent_id: params.stripePaymentIntentId ?? null,
    })
        .eq('user_id', params.userId)
        .eq('duffel_order_id', params.duffelOrderId);
    if (error) {
        console.warn(`[supabase] confirmFlightBooking failed user=${params.userId} order=${params.duffelOrderId}:`, error.message);
        return;
    }
    console.log(`[supabase] flight_booking confirmed order=${params.duffelOrderId} user=${params.userId}`);
}
export async function saveRestaurantBooking(params) {
    const { data, error } = await supabase
        .from('restaurant_bookings')
        .insert({
        user_id: params.userId,
        venue_id: params.venueId,
        venue_name: params.venueName,
        reservation_date: params.reservationDate,
        reservation_time: params.reservationTime,
        party_size: params.partySize,
        confirmation_code: params.confirmationCode ?? null,
        resy_token: params.resyToken,
        location: params.location ?? null,
        seating_type: params.seatingType ?? null,
        metadata: params.metadata ?? null,
    })
        .select('id')
        .single();
    if (error) {
        console.warn(`[supabase] saveRestaurantBooking failed user=${params.userId} venue=${params.venueId}:`, error.message);
        return null;
    }
    console.log(`[supabase] restaurant_booking saved id=${data.id} user=${params.userId} venue=${params.venueName} ${params.reservationDate} ${params.reservationTime}`);
    return data.id;
}
export async function getActiveRestaurantBookings(userId, limit = 10) {
    const { data, error } = await supabase
        .from('restaurant_bookings')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('reservation_date', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) {
        console.warn(`[supabase] getActiveRestaurantBookings failed user=${userId}:`, error.message);
        return [];
    }
    return (data ?? []);
}
export async function markRestaurantBookingCancelled(params) {
    const { error } = await supabase
        .from('restaurant_bookings')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('user_id', params.userId)
        .eq('resy_token', params.resyToken)
        .eq('status', 'active');
    if (error) {
        console.warn(`[supabase] markRestaurantBookingCancelled failed user=${params.userId} token=${params.resyToken}:`, error.message);
        return;
    }
    console.log(`[supabase] restaurant_booking cancelled token=${params.resyToken} user=${params.userId}`);
}
