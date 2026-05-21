import Anthropic, { APIError, APIConnectionError, APIConnectionTimeoutError, InternalServerError, RateLimitError, } from '@anthropic-ai/sdk';
import { tools } from './tools.js';
import { searchFlights, holdOrder, bookOrderInstant, getOfferPricing, payForOrderWithBalance, OfferRequiresInstantPaymentError, } from '../services/duffel.js';
import { chargeViaSPT, refundPaymentIntent, isStripeConfigurationError } from '../services/stripe.js';
import { offersToSMS, formatHeldOrderConfirmationSMS, sortFlightOffersByPrice, } from '../utils/formatFlights.js';
import { summarizeOffersForContext, formatLastSearchForPrompt } from '../utils/flightSearchContext.js';
import { formatLastRestaurantSearchForPrompt, summarizeVenuesForContext, slimVenuesForTool } from '../utils/restaurantSearchContext.js';
import { restaurantsToSMS, restaurantDetailToSMS } from '../utils/formatRestaurants.js';
import { searchRestaurants, getRestaurantAvailability, isResyConfigured, formatResyError, ResyNotConfiguredError, } from '../services/resy.js';
import { computeAllInPrice, formatMoneyFromCents, logPriceBreakdown } from '../utils/pricing.js';
import { setLastFlightSearch, clearLastFlightSearch, setLastRestaurantSearch, setPendingOrder, clearPendingOrder, } from '../services/supabase.js';
import { resolveRelativeDates } from '../utils/resolveRelativeDates.js';
import { buildSignupUrl } from '../utils/signupUrl.js';
import { formatDuffelError, isStaleOfferError } from '../utils/duffelErrors.js';
import { getSharedFriendLocation } from '../services/imessage.js';
import { nearestAirports } from '../utils/nearestAirport.js';
import { generateFlightCardImage, generateRestaurantCardImage, flightCardInputFromHeldOrder, flightCardInputFromOffer, restaurantCardInputFromVenue, } from '../images/satori/index.js';
const SEARCH_PREVIEW_CARD_LIMIT = Math.max(0, Math.min(5, Number.parseInt(process.env.REMI_SEARCH_PREVIEW_CARDS ?? '5', 10) || 0));
/** Cheapest first; when preview cards are enabled, same length as image count. */
function surfacedSearchOffers(offers) {
    const sorted = sortFlightOffersByPrice(offers);
    if (SEARCH_PREVIEW_CARD_LIMIT <= 0)
        return sorted;
    return sorted.slice(0, SEARCH_PREVIEW_CARD_LIMIT);
}
function paymentFailureMessage(err) {
    if (isStripeConfigurationError(err)) {
        return "I can't process payment right now because Remi's Stripe connection is misconfigured. Try again after I fix it.";
    }
    const message = err instanceof Error ? err.message : String(err);
    return `I couldn't process your payment (${message}). Please update your card and try again.`;
}
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const ANTHROPIC_MESSAGE_MAX_ATTEMPTS = Math.max(1, Math.min(12, Number.parseInt(process.env.REMI_ANTHROPIC_MAX_ATTEMPTS ?? '8', 10) || 8));
function delayMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/** When Error.message is like `529 {"type":"error",...}` (SDK shape) but instanceof checks fail across bundles. */
function errorMessageLooksRetryable(message) {
    const m = message.trim();
    if (/^529\b/.test(m))
        return true;
    if (/overloaded_error/i.test(m))
        return true;
    if (/^503\b|^502\b|^504\b|^500\b/.test(m))
        return true;
    if (/^429\b/.test(m))
        return true;
    return false;
}
function isRetryableAnthropicError(err) {
    if (err instanceof RateLimitError)
        return true;
    if (err instanceof InternalServerError)
        return true;
    if (err instanceof APIConnectionTimeoutError)
        return true;
    if (err instanceof APIConnectionError)
        return true;
    if (err instanceof APIError) {
        if (err.type === 'overloaded_error')
            return true;
        const s = err.status;
        if (s === 429)
            return true;
        if (typeof s === 'number' && s >= 500 && s < 600)
            return true;
    }
    if (err instanceof Error && errorMessageLooksRetryable(err.message))
        return true;
    return false;
}
/** After all retries failed, or for logging — should we tell the user to try again soon? */
export function isAnthropicCapacityError(err) {
    return isRetryableAnthropicError(err);
}
async function createMessageWithRetries(params) {
    let lastErr;
    for (let attempt = 1; attempt <= ANTHROPIC_MESSAGE_MAX_ATTEMPTS; attempt += 1) {
        try {
            return await anthropic.messages.create(params);
        }
        catch (err) {
            lastErr = err;
            const retry = attempt < ANTHROPIC_MESSAGE_MAX_ATTEMPTS && isRetryableAnthropicError(err);
            const detail = err instanceof APIError
                ? `status=${err.status} type=${err.type ?? '?'}`
                : err instanceof Error
                    ? err.message
                    : String(err);
            if (!retry) {
                throw err;
            }
            const backoff = Math.min(60_000, 2_000 * 2 ** (attempt - 1));
            const jitter = Math.floor(Math.random() * 500);
            const wait = backoff + jitter;
            console.warn(`[anthropic] messages.create failed (${detail}), retry ${attempt}/${ANTHROPIC_MESSAGE_MAX_ATTEMPTS} after ${(wait / 1000).toFixed(2)}s (${wait} ms backoff)`);
            await delayMs(wait);
        }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
const SYSTEM_PROMPT = `You are Remi, a friendly AI travel and dining concierge over SMS. You help with flights and restaurant availability. Be concise — every response is an SMS.

Today's date is ${new Date().toISOString().split('T')[0]}.

Rules:
- Keep replies short. Max 3 sentences unless you are pasting a multi-option list from tool output (flights or restaurants).
- Plain text only: no Markdown, no asterisks (*), no bold/italics markers, no backticks.
- When search_flights returns a formatted option list, every line block in that list matches one preview image (same count, cheapest-first order). Never shorten or drop options from that list.
- When search_restaurants returns a formatted list, use it verbatim — do not reformat, paraphrase, or omit options. When preview images are attached, the numbered list in "formatted" must match the image count (same order).
- Always resolve relative dates (e.g. "Friday", "tonight", "this Saturday") using today's date before calling search_flights or search_restaurants.
- Decide whether the user wants a one-way or round-trip flight. If round-trip, collect both departure_date and return_date before calling search_flights.
- If pending flight options are listed in context below, use them: when the user picks an airline or says first/second/third/fourth/fifth (by position), pick the matching offer_id. Do not ask for dates again if they already gave them or if those options already reflect the trip.
- If the user's message includes [Context: ...] indicating they replied to a specific preview image, treat that option as their selection — do not ask "which one?"
- If pending restaurant options are listed in context below, use them ONLY for venue selection (when the user picks by name, position, or image reply). If the user's current message asks for a different cuisine, neighborhood, date, party size, or city than the cached search params, you MUST call search_restaurants again with the new parameters — do NOT relabel cached venues as a different cuisine.
- If the user's message includes [Context: ...] indicating they replied to a specific preview image, treat that option as their selection — do not ask "which one?"
- Before taking action on a specific flight, restate the exact flight (airline, time, price) and ask ONE question: "HOLD or BOOK?"
- If the user asks to book or reserve a restaurant table, tell them you can show availability today and full Resy booking is coming soon. Do not attempt to book.

Intent recognition (only after you have just asked "HOLD or BOOK?" on a specific flight):
- BOOK intent (call book_flight with the matching offer_id): "BOOK", "book it", "book please", "please book", "get it", "buy it", "purchase", "lock it in", "do it", "go ahead", "yes", "yep", "yeah", "sure", "ok", "okay", "let's go", "confirm".
- HOLD intent (call hold_flight with the matching offer_id): "HOLD", "hold it", "save it", "reserve it", "pencil it in", "keep it".
- Negative ("no", "not yet", "wait", "cancel", "nevermind"): do not call any tool. Ask what they want.
- If a bare affirmative arrives without a recent "HOLD or BOOK?" question on a specific flight, do not call any tool — ask one clarifying question.

Tool calling discipline (IMPORTANT):
- Make AT MOST ONE tool call per user turn. Never call the same tool twice in one turn.
- Do not call search_restaurants more than once per turn. Pick exactly one cuisine/query and one date. If the user gave a cuisine (e.g. "sushi"), use only that — do not also search a backup cuisine.
- Do not call search_flights more than once per turn. Pick exactly one origin/destination/date combo.
- If you are unsure which date or city to use, ASK the user instead of calling the tool with a guess.
- Never make speculative parallel tool calls "in case the first returns nothing".

Tool routing:
- Flight requests → search_flights, hold_flight, book_flight, confirm_booking as appropriate.
- Restaurant / table / dinner availability → search_restaurants. If location is missing, call get_user_location first when they may have shared Find My location; derive a city from coordinates or ask which city.
- User picks a restaurant from results → get_restaurant_availability with venue_id from the latest search.
- BOOK intent → book_flight (charges the user and creates the order in one step; works for any carrier, including Frontier and other instant-payment airlines).
- HOLD intent → hold_flight. If hold_flight returns { error: true, instant_only: true }, tell the user this airline requires instant payment and ask if they want to BOOK now; on BOOK affirmative call book_flight.
- For book_flight / hold_flight, always use an offer_id from the "offers" array in the latest search (or the pending options list in context). Never invent flights, prices, or flight numbers.
- For get_restaurant_availability, always use a venue_id from the latest search_restaurants (or pending restaurant list in context). Never invent venue IDs.

Output formatting:
- When search_flights returns results, use the "formatted" field as your reply verbatim — do not reformat, paraphrase, or omit options (count must match the number of image cards). Append one follow-up line: "Which one?" or "Want me to book one?"
- When search_restaurants returns results with a "formatted" field and no "error", use "formatted" as your reply verbatim. Never say search failed when formatted is present. Append one follow-up line: "Which one?" or "Want times for one?"
- When search_restaurants returns { error: true, message }, relay the message to the user briefly; do not invent a generic failure if a specific message is provided.
- When get_restaurant_availability returns results, use the "formatted" field as your reply verbatim.
- When hold_flight returns successfully, use the "formatted" field as your reply verbatim — do not reformat or paraphrase it.
- When book_flight returns successfully, reply with: "Booked! Confirmation: <booking_reference>. Have a great flight!" (use the booking_reference from the tool result).
- Format prices as "$X" not "$X.XX" unless cents matter.
- If a user's flight request is ambiguous (e.g. no origin city), call get_user_location first when they may have shared Find My location with Remi. If location is available, use the nearest airport as origin. If not_sharing, ask where they are flying from and mention they can share location with Remi in Find My (People → Share My Location). If no_coordinates yet, ask for their departure city or airport. If multiple nearby airports are returned, ask which one.`;
async function attachFlightCardSafely(ctx, order, formattedPrice, tag) {
    try {
        const input = flightCardInputFromHeldOrder(order, formattedPrice);
        if (!input)
            return;
        const image = await generateFlightCardImage({
            ...input,
            optionLabel: 'Confirm flight',
        });
        if (image) {
            ctx.attachments.push(image);
            console.log(`[flightCardImage] attached for ${tag}`);
        }
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[flightCardImage] skipped for ${tag}: ${msg}`);
    }
}
async function attachSearchPreviewCardsSafely(ctx, offers, tag) {
    if (SEARCH_PREVIEW_CARD_LIMIT === 0 || offers.length === 0)
        return;
    try {
        // Render sequentially to keep peak memory low (each Satori+Resvg pass holds
        // ~50-100MB of bitmap state; Render's 512MB instances OOM at 5x parallel).
        const images = [];
        for (const [index, offer] of offers.entries()) {
            const allIn = computeAllInPrice(offer.total_amount, offer.total_currency);
            const price = formatMoneyFromCents(allIn.chargeAmountCents, allIn.currency);
            const input = flightCardInputFromOffer(offer, price);
            if (!input) {
                images.push(null);
                continue;
            }
            const img = await generateFlightCardImage({
                ...input,
                optionLabel: `Option ${index + 1}`,
            });
            images.push(img);
        }
        let attached = 0;
        for (const [index, img] of images.entries()) {
            if (img) {
                const offer = offers[index];
                ctx.attachments.push({
                    ...img,
                    ref: offer
                        ? {
                            kind: 'flight',
                            optionIndex: index,
                            entityId: offer.id,
                            label: `${offer.slices[0]?.segments[0]?.marketing_carrier_name ?? 'Flight'} ${offer.slices[0]?.segments[0]?.flight_number ?? ''}`.trim(),
                        }
                        : undefined,
                });
                attached += 1;
            }
        }
        if (attached > 0) {
            console.log(`[flightCardImage] attached ${attached} preview(s) for ${tag}`);
        }
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[flightCardImage] preview skipped for ${tag}: ${msg}`);
    }
}
async function attachSearchPreviewRestaurantCardsSafely(ctx, venues, meta, tag) {
    if (SEARCH_PREVIEW_CARD_LIMIT === 0 || venues.length === 0)
        return;
    try {
        const previewVenues = venues.slice(0, SEARCH_PREVIEW_CARD_LIMIT);
        const images = [];
        for (const [index, venue] of previewVenues.entries()) {
            const input = restaurantCardInputFromVenue(venue, {
                date: meta.date,
                partySize: meta.partySize,
                optionLabel: `Option ${index + 1}`,
            });
            const img = await generateRestaurantCardImage(input);
            images.push(img);
        }
        let attached = 0;
        for (const [index, img] of images.entries()) {
            if (img) {
                const venue = previewVenues[index];
                ctx.attachments.push({
                    ...img,
                    ref: venue
                        ? {
                            kind: 'restaurant',
                            optionIndex: index,
                            entityId: String(venue.venue_id),
                            label: venue.name,
                        }
                        : undefined,
                });
                attached += 1;
            }
        }
        if (attached > 0) {
            console.log(`[restaurantCardImage] attached ${attached} preview(s) for ${tag}`);
        }
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[restaurantCardImage] preview skipped for ${tag}: ${msg}`);
    }
}
async function executeTool(toolName, input, user, ctx) {
    if (toolName === 'get_user_location') {
        const loc = await getSharedFriendLocation(user.phone);
        if (!loc.ok) {
            return JSON.stringify({ available: false, reason: loc.reason });
        }
        const nearest = nearestAirports(loc.latitude, loc.longitude, 2);
        return JSON.stringify({
            available: true,
            latitude: loc.latitude,
            longitude: loc.longitude,
            shortAddress: loc.shortAddress,
            longAddress: loc.longAddress,
            locationType: loc.locationType,
            nearest_airports: nearest,
            suggested_origin: nearest[0]?.iata,
        });
    }
    if (toolName === 'search_flights') {
        const { offers, rawOfferRequest } = await searchFlights({
            origin: input.origin,
            destination: input.destination,
            departure_date: input.departure_date,
            return_date: input.return_date || undefined,
            cabin_class: input.cabin_class,
            adult_count: input.adult_count,
        });
        const surfaced = surfacedSearchOffers(offers);
        await setLastFlightSearch(user.id, {
            offers: summarizeOffersForContext(surfaced),
            updated_at: new Date().toISOString(),
            search_params: {
                origin: input.origin,
                destination: input.destination,
                departure_date: input.departure_date,
                return_date: input.return_date || undefined,
            },
            duffel_raw_offer_request: rawOfferRequest,
        });
        await attachSearchPreviewCardsSafely(ctx, surfaced, `search:${input.origin}-${input.destination}`);
        return JSON.stringify({ formatted: offersToSMS(surfaced), offers: surfaced });
    }
    if (toolName === 'hold_flight') {
        const offerId = input.offer_id;
        const allowedIds = user.last_flight_search?.offers?.map((o) => o.offer_id) ?? [];
        if (allowedIds.length > 0 && !allowedIds.includes(offerId)) {
            return JSON.stringify({
                error: true,
                message: 'That offer_id is not in the latest search. Call search_flights again with the same route and dates, then call hold_flight only with an offer_id from the new offers list.',
            });
        }
        const nameParts = user.name.trim().split(' ');
        const given_name = nameParts[0];
        const family_name = nameParts.slice(1).join(' ') || nameParts[0];
        const params = user.last_flight_search?.search_params;
        let holdResult;
        try {
            holdResult = await holdOrder(offerId, {
                title: 'mr',
                gender: user.gender,
                given_name,
                family_name,
                date_of_birth: user.date_of_birth,
                email: user.email,
                phone_number: user.phone,
                passport_number: user.passport_number,
            });
        }
        catch (err) {
            if (err instanceof OfferRequiresInstantPaymentError) {
                return JSON.stringify({
                    error: true,
                    instant_only: true,
                    offer_id: err.offerId,
                    amount: err.amount,
                    currency: err.currency,
                    message: "This airline requires instant payment, so I can't put it on hold. Want me to BOOK it now? Reply BOOK to confirm.",
                });
            }
            if (params && isStaleOfferError(err)) {
                const { offers, rawOfferRequest } = await searchFlights({
                    origin: params.origin,
                    destination: params.destination,
                    departure_date: params.departure_date,
                    return_date: params.return_date,
                });
                await setLastFlightSearch(user.id, {
                    offers: summarizeOffersForContext(offers),
                    updated_at: new Date().toISOString(),
                    search_params: params,
                    duffel_raw_offer_request: rawOfferRequest,
                });
                return JSON.stringify({
                    error: true,
                    stale_offer: true,
                    formatted: offersToSMS(offers),
                    offers,
                    message: `Offer expired (${formatDuffelError(err)}). Fresh results are in "formatted". Ask the user to pick again from this list only; then call hold_flight with the new offer_id.`,
                });
            }
            throw err;
        }
        const order = holdResult.order;
        const outSeg = order.slices[0]?.segments[0];
        const retSeg = order.slices[1]?.segments[0];
        const from = order.slices[0]?.origin ?? '';
        const to = order.slices[0]?.destination ?? '';
        const airline = outSeg?.marketing_carrier_name ?? 'Airline';
        const allIn = computeAllInPrice(order.total_amount, order.total_currency);
        const price = formatMoneyFromCents(allIn.chargeAmountCents, allIn.currency);
        logPriceBreakdown('hold', allIn, {
            offer_id: offerId,
            order_id: order.id,
            booking_reference: order.booking_reference,
        });
        const confirmation = formatHeldOrderConfirmationSMS({
            from,
            to,
            airline,
            price,
            depart_date: order.slices[0]?.departure_date ?? '',
            depart_time: (outSeg?.departing_at?.split('T')[1]?.slice(0, 5)) ?? '00:00',
            arrive_time: (outSeg?.arriving_at?.split('T')[1]?.slice(0, 5)) ?? '00:00',
            return_date: order.slices[1]?.departure_date,
            return_depart_time: retSeg?.departing_at?.split('T')[1]?.slice(0, 5),
            return_arrive_time: retSeg?.arriving_at?.split('T')[1]?.slice(0, 5),
        });
        await setPendingOrder({
            userId: user.id,
            orderId: order.id,
            bookingReference: order.booking_reference,
            amount: order.total_amount,
            currency: order.total_currency,
            duffelPayload: {
                offer_get: holdResult.rawOfferGet,
                order_create: holdResult.rawOrderCreate,
            },
        });
        await clearLastFlightSearch(user.id);
        await attachFlightCardSafely(ctx, order, price, `hold:${order.booking_reference}`);
        return JSON.stringify({ order, formatted: confirmation });
    }
    if (toolName === 'book_flight') {
        const offerId = input.offer_id;
        const allowedIds = user.last_flight_search?.offers?.map((o) => o.offer_id) ?? [];
        if (allowedIds.length > 0 && !allowedIds.includes(offerId)) {
            return JSON.stringify({
                error: true,
                message: 'That offer_id is not in the latest search. Call search_flights again with the same route and dates, then call book_flight only with an offer_id from the new offers list.',
            });
        }
        if (!user.stripe_spt_id) {
            return JSON.stringify({
                success: false,
                message: `No payment method on file yet. Add your card here: ${buildSignupUrl(user.phone)}`,
            });
        }
        const params = user.last_flight_search?.search_params;
        const nameParts = user.name.trim().split(' ');
        const given_name = nameParts[0];
        const family_name = nameParts.slice(1).join(' ') || nameParts[0];
        let pricing;
        try {
            pricing = await getOfferPricing(offerId);
        }
        catch (err) {
            const dErr = formatDuffelError(err);
            console.error('[book_flight] getOfferPricing failed:', dErr);
            if (params && isStaleOfferError(err)) {
                const { offers, rawOfferRequest } = await searchFlights({
                    origin: params.origin,
                    destination: params.destination,
                    departure_date: params.departure_date,
                    return_date: params.return_date,
                });
                await setLastFlightSearch(user.id, {
                    offers: summarizeOffersForContext(offers),
                    updated_at: new Date().toISOString(),
                    search_params: params,
                    duffel_raw_offer_request: rawOfferRequest,
                });
                return JSON.stringify({
                    success: false,
                    stale_offer: true,
                    formatted: offersToSMS(offers),
                    offers,
                    message: `That offer expired before I could book it (${dErr}). Here are fresh options — pick one and I'll book.`,
                });
            }
            return JSON.stringify({
                success: false,
                message: `I couldn't reach the airline to confirm price (${dErr}). Try again in a moment?`,
            });
        }
        const amountStr = pricing.amount;
        const currency = pricing.currency.toLowerCase();
        const allIn = computeAllInPrice(amountStr, currency);
        const amountInCents = allIn.chargeAmountCents;
        logPriceBreakdown('book', allIn, { offer_id: offerId, user_id: user.id });
        let paymentIntentId;
        try {
            paymentIntentId = await chargeViaSPT(user.stripe_spt_id, amountInCents, currency, user.stripe_customer_id);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error('[book_flight] stripe charge failed:', message);
            return JSON.stringify({
                success: false,
                message: paymentFailureMessage(err),
            });
        }
        let bookResult;
        try {
            bookResult = await bookOrderInstant(offerId, {
                title: 'mr',
                gender: user.gender,
                given_name,
                family_name,
                date_of_birth: user.date_of_birth,
                email: user.email,
                phone_number: user.phone,
                passport_number: user.passport_number,
            });
        }
        catch (err) {
            const dErr = formatDuffelError(err);
            console.error('[book_flight] duffel order failed after stripe charge:', dErr);
            try {
                if (paymentIntentId) {
                    const refundId = await refundPaymentIntent(paymentIntentId);
                    console.log(`[book_flight] refunded stripe payment ${paymentIntentId} → ${refundId}`);
                }
            }
            catch (refundErr) {
                const rMsg = refundErr instanceof Error ? refundErr.message : String(refundErr);
                console.error('[book_flight] STRIPE REFUND FAILED — manual review needed:', rMsg, {
                    payment_intent: paymentIntentId,
                    user_id: user.id,
                });
            }
            if (params && isStaleOfferError(err)) {
                const { offers, rawOfferRequest } = await searchFlights({
                    origin: params.origin,
                    destination: params.destination,
                    departure_date: params.departure_date,
                    return_date: params.return_date,
                });
                await setLastFlightSearch(user.id, {
                    offers: summarizeOffersForContext(offers),
                    updated_at: new Date().toISOString(),
                    search_params: params,
                    duffel_raw_offer_request: rawOfferRequest,
                });
                return JSON.stringify({
                    success: false,
                    stale_offer: true,
                    formatted: offersToSMS(offers),
                    offers,
                    message: `That offer expired before I could book it (${dErr}). I refunded the charge. Here are fresh options — pick one and I'll book.`,
                });
            }
            return JSON.stringify({
                success: false,
                message: `I charged your card but the airline rejected the booking (${dErr}). I've refunded the charge. Want to try a different flight?`,
            });
        }
        const order = bookResult.order;
        await setPendingOrder({
            userId: user.id,
            orderId: order.id,
            bookingReference: order.booking_reference,
            amount: order.total_amount,
            currency: order.total_currency,
            duffelPayload: {
                offer_get: bookResult.rawOfferGet,
                order_create: bookResult.rawOrderCreate,
                stripe_payment_intent: paymentIntentId,
            },
        });
        await clearLastFlightSearch(user.id);
        await clearPendingOrder(user.id);
        const formattedPrice = formatMoneyFromCents(amountInCents, currency);
        await attachFlightCardSafely(ctx, order, formattedPrice, `book:${order.booking_reference}`);
        return JSON.stringify({
            success: true,
            booking_reference: order.booking_reference,
            message: `Booked! Confirmation: ${order.booking_reference}. Have a great flight!`,
        });
    }
    if (toolName === 'confirm_booking') {
        if (!user.stripe_spt_id) {
            return JSON.stringify({
                success: false,
                message: `No payment method on file yet. Add your card here: ${buildSignupUrl(user.phone)}`,
            });
        }
        if (!user.pending_order_id) {
            return JSON.stringify({
                success: false,
                message: 'I can either HOLD or BOOK a flight, but I need a specific option first. Which flight do you want?',
            });
        }
        // If the model doesn't know the order context (because SMS history is plain text),
        // fall back to the last held order persisted on the user record.
        const orderId = input.order_id || user.pending_order_id;
        const amountStr = input.amount || user.pending_order_amount;
        const currency = (input.currency || user.pending_order_currency || '').toLowerCase();
        if (!orderId || !amountStr || !currency) {
            return JSON.stringify({
                success: false,
                message: "I don't have a held flight to book yet. Tell me which flight you want and I can hold it first.",
            });
        }
        const allIn = computeAllInPrice(amountStr, currency);
        const amountInCents = allIn.chargeAmountCents;
        logPriceBreakdown('confirm_booking', allIn, {
            order_id: orderId,
            user_id: user.id,
        });
        try {
            await chargeViaSPT(user.stripe_spt_id, amountInCents, currency, user.stripe_customer_id);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error('[confirm_booking] stripe charge failed:', message);
            return JSON.stringify({
                success: false,
                message: paymentFailureMessage(err),
            });
        }
        await payForOrderWithBalance(orderId, amountStr, currency.toUpperCase());
        await clearLastFlightSearch(user.id);
        await clearPendingOrder(user.id);
        return JSON.stringify({ success: true, message: 'Payment processed and booking confirmed.' });
    }
    if (toolName === 'search_restaurants') {
        if (!isResyConfigured()) {
            return JSON.stringify({
                error: true,
                message: 'Dining search is temporarily unavailable. Try again later.',
            });
        }
        const location = input.location;
        const date = input.date;
        const partySize = input.party_size ?? 2;
        const query = input.query || undefined;
        try {
            let venues = await searchRestaurants({ location, date, partySize, query });
            let queryRelaxed = false;
            if (venues.length === 0 && query) {
                venues = await searchRestaurants({ location, date, partySize });
                queryRelaxed = true;
            }
            const surfaced = venues.slice(0, 5);
            let formatted = restaurantsToSMS(surfaced, { location, date, partySize });
            if (queryRelaxed && surfaced.length > 0) {
                formatted = `No "${query}" matches — open tables nearby:\n\n${formatted}`;
            }
            const saved = await setLastRestaurantSearch(user.id, {
                venues: summarizeVenuesForContext(surfaced),
                updated_at: new Date().toISOString(),
                search_params: { location, date, party_size: partySize, query },
            });
            if (!saved) {
                console.warn('[search_restaurants] results ok but last_restaurant_search not persisted (run Supabase migration?)');
            }
            await attachSearchPreviewRestaurantCardsSafely(ctx, surfaced, { date, partySize }, `search:${location}-${date}`);
            return JSON.stringify({ formatted, venues: slimVenuesForTool(surfaced) });
        }
        catch (err) {
            const message = err instanceof ResyNotConfiguredError
                ? 'Dining search is temporarily unavailable. Try again later.'
                : formatResyError(err);
            console.error(`[search_restaurants] ${message}`);
            return JSON.stringify({ error: true, message });
        }
    }
    if (toolName === 'get_restaurant_availability') {
        if (!isResyConfigured()) {
            return JSON.stringify({
                error: true,
                message: 'Dining search is temporarily unavailable. Try again later.',
            });
        }
        const venueId = input.venue_id;
        const partySize = input.party_size ?? 2;
        const allowedIds = user.last_restaurant_search?.venues?.map((v) => v.venue_id) ?? [];
        const searchParams = user.last_restaurant_search?.search_params;
        const date = input.date || searchParams?.date;
        if (!date) {
            return JSON.stringify({
                error: true,
                message: 'Missing date. Call search_restaurants first or provide a date in YYYY-MM-DD format.',
            });
        }
        if (allowedIds.length > 0 && !allowedIds.includes(venueId)) {
            return JSON.stringify({
                error: true,
                message: 'That venue_id is not in the latest search. Call search_restaurants again, then get_restaurant_availability only with a venue_id from the new results.',
            });
        }
        try {
            const venue = await getRestaurantAvailability({ venueId, date, partySize });
            if (!venue) {
                return JSON.stringify({
                    error: true,
                    message: `No availability found for venue ${venueId} on ${date} for ${partySize}.`,
                });
            }
            const formatted = restaurantDetailToSMS(venue);
            return JSON.stringify({ formatted, venue });
        }
        catch (err) {
            if (err instanceof ResyNotConfiguredError) {
                return JSON.stringify({
                    error: true,
                    message: 'Dining search is temporarily unavailable. Try again later.',
                });
            }
            return JSON.stringify({ error: true, message: formatResyError(err) });
        }
    }
    throw new Error(`Unknown tool: ${toolName}`);
}
export async function runAgentLoop(userMessage, history, user) {
    const flightPending = formatLastSearchForPrompt(user.last_flight_search ?? undefined);
    const restaurantPending = formatLastRestaurantSearchForPrompt(user.last_restaurant_search ?? undefined);
    const contextParts = [flightPending, restaurantPending].filter(Boolean);
    const todayISO = new Date().toISOString().split('T')[0];
    const resolved = resolveRelativeDates(userMessage, todayISO);
    const systemBase = contextParts.length ? `${SYSTEM_PROMPT}\n\n${contextParts.join('\n\n')}` : SYSTEM_PROMPT;
    const system = resolved.changed
        ? `${systemBase}\n\nRelative date resolution: Interpret the user's last message as: "${resolved.resolvedText}".`
        : systemBase;
    const messages = [
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage },
    ];
    const ctx = { attachments: [] };
    while (true) {
        const response = await createMessageWithRetries({
            model: 'claude-sonnet-4-6',
            max_tokens: 1024,
            system,
            tools,
            tool_choice: { type: 'auto', disable_parallel_tool_use: true },
            messages,
        });
        if (response.stop_reason === 'end_turn') {
            const textBlock = response.content.find((b) => b.type === 'text');
            return { text: textBlock?.text ?? '', attachments: ctx.attachments };
        }
        if (response.stop_reason === 'tool_use') {
            const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');
            messages.push({ role: 'assistant', content: response.content });
            const toolResults = await Promise.all(toolUseBlocks.map(async (block) => {
                try {
                    console.log(`[tool] ${block.name} input=${JSON.stringify(block.input)}`);
                    const result = await executeTool(block.name, block.input, user, ctx);
                    console.log(`[tool] ${block.name} ok`);
                    return { type: 'tool_result', tool_use_id: block.id, content: result };
                }
                catch (err) {
                    const message = formatDuffelError(err);
                    console.error(`[tool] ${block.name} error:`, message);
                    return {
                        type: 'tool_result',
                        tool_use_id: block.id,
                        content: `Error: ${message}`,
                        is_error: true,
                    };
                }
            }));
            messages.push({ role: 'user', content: toolResults });
            continue;
        }
        throw new Error(`Unexpected stop_reason: ${response.stop_reason}`);
    }
}
