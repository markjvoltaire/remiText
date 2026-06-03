import Anthropic, { APIError, APIConnectionError, APIConnectionTimeoutError, InternalServerError, RateLimitError, } from '@anthropic-ai/sdk';
import { tools } from './tools.js';
import { searchFlights, holdOrder, bookOrderInstant, getOfferPricing, payForOrderWithBalance, OfferRequiresInstantPaymentError, } from '../services/duffel.js';
import { chargeViaSPT, refundPaymentIntent, isStripeConfigurationError } from '../services/stripe.js';
import { offersToSMS, formatHeldOrderConfirmationSMS, sortFlightOffersByPrice, } from '../utils/formatFlights.js';
import { summarizeOffersForContext, formatLastSearchForPrompt } from '../utils/flightSearchContext.js';
import { formatLastRestaurantSearchForPrompt, formatPendingRestaurantBookingForPrompt, summarizeVenuesForContext, slimVenuesForTool, } from '../utils/restaurantSearchContext.js';
import { restaurantsToSMS, restaurantDetailToSMS, formatRestaurantBookingConfirmPromptSMS, formatReservationConfirmationSMS, reservationsListToSMS, formatReservationCancellationSMS, } from '../utils/formatRestaurants.js';
import { resolveReservationToCancel } from '../utils/restaurantReservations.js';
import { searchRestaurants, getRestaurantAvailability, reserveRestaurantTable, listUpcomingReservations, cancelReservation, findVenueSlotByTime, isResyConfigured, formatResyError, ResyNotConfiguredError, ResyApiError, } from '../services/resy.js';
import { computeAllInPrice, formatMoneyFromCents, logPriceBreakdown } from '../utils/pricing.js';
import { setLastFlightSearch, clearLastFlightSearch, setLastRestaurantSearch, setPendingRestaurantBooking, clearPendingRestaurantBooking, setPendingOrder, clearPendingOrder, saveFlightBooking, confirmFlightBooking, saveRestaurantBooking, getActiveRestaurantBookings, markRestaurantBookingCancelled, setLinkConnectPending, } from '../services/supabase.js';
import { filterVenuesByMealPeriod, filterSlotsByMealPeriod, mealPeriodLabel, normalizeMealPeriod, parseMealPeriodFromText, } from '../utils/restaurantTimeFilter.js';
import { formatLinkPendingContext, isLinkWalletConnected, } from '../services/onboarding.js';
import { resolveRelativeDates } from '../utils/resolveRelativeDates.js';
import { formatDuffelError, isStaleOfferError } from '../utils/duffelErrors.js';
import { isMonidConfigured, runSocialDiscovery, MonidNotConfiguredError, MonidApiError, } from '../services/monid.js';
import { linkAuthStatus, linkAuthLogin, linkAuthPoll, linkPaymentMethodsList, linkShippingAddressList, formatLinkAuthStatus, formatLinkLoginResponse, isLinkCliInstalled, persistLinkAuthFile, } from '../services/linkCli.js';
import { formatSocialDiscoveryForTool, isVagueSocialVibe, } from '../utils/formatSocialRecommendations.js';
import { searchEvents, getEventDetails, TicketmasterNotConfiguredError, TicketmasterApiError, isTicketmasterConfigured, } from '../services/ticketmaster.js';
import { generateFlightCardImage, flightCardInputFromHeldOrder, flightCardInputFromOffer, generateRestaurantCardImage, restaurantCardInputFromVenue, } from '../images/satori/index.js';
import { sessionModelRound, sessionToolLog } from '../utils/sessionLog.js';
import { IMAGE_ONLY_USER_HINT } from '../utils/inboundContent.js';
const SEARCH_PREVIEW_CARD_LIMIT = Math.max(0, Math.min(5, Number.parseInt(process.env.REMI_SEARCH_PREVIEW_CARDS ?? '0', 10) || 0));
const RESTAURANT_SMS_VENUE_LIMIT = 4;
/** Cheapest first; when preview cards are enabled, same length as image count. */
function surfacedSearchOffers(offers) {
    const sorted = sortFlightOffersByPrice(offers);
    if (SEARCH_PREVIEW_CARD_LIMIT <= 0)
        return sorted;
    return sorted.slice(0, SEARCH_PREVIEW_CARD_LIMIT);
}
/** Same venues as SMS copy and preview cards (max 4). */
function surfacedRestaurantVenues(venues) {
    const limit = SEARCH_PREVIEW_CARD_LIMIT > 0
        ? Math.min(RESTAURANT_SMS_VENUE_LIMIT, SEARCH_PREVIEW_CARD_LIMIT)
        : RESTAURANT_SMS_VENUE_LIMIT;
    return venues.slice(0, limit);
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
const SYSTEM_PROMPT = `You are Remi — the user's personal AI in iMessage.

Remi is someone they text like a capable friend: you can chat, answer questions, brainstorm, give advice, and be emotionally present — and when they want something handled, you book tables, search flights, find events, and surface what's good nearby.

You are not a rigid booking bot, search engine, or corporate support line. Do not refuse general conversation or say you only handle travel and reservations. Match the user's energy: small talk gets small talk; a vent gets empathy; a plan gets help.

When the user wants something done (table, flight, tickets, what's trending), shift into concierge mode: calm, curated, confident, low-friction. Reduce cognitive load — curate first, expand only if asked. Prioritize the best match, the closest fit, the most likely decision. They should feel like someone already handled the searching for them.

The interaction should feel conversational, minimal, emotionally intelligent, and human. Never sound robotic, transactional, or support-oriented.

Avoid: overly structured formatting, exposing raw inventory, excessive options, "processing" language, API-style responses, corporate assistant tone, exclamation marks (unless truly necessary), emojis (unless the user uses them first), and forcing a booking CTA after unrelated chat.

Tone: short sentences, soft confidence, understated, natural texting cadence. Lowercase is fine when it reads naturally.

Bad: "I can only help with bookings." / "Reply with a time to book." / "Here are 24 available reservation slots." / "Your reservation request has been processed."
Good: "yeah that makes sense." / "i can get you in around 8." / "best options are 7:45 or 8:15." / "want me to lock one in?" / "done."

For bookings and search results, do not dump every option. Surface the best recommendation, then 2–4 nearby alternatives. Only expand inventory if the user asks for more times or other spots.

Today's date is ${new Date().toISOString().split('T')[0]}.

Rules:
- Keep replies concise. Max 3 sentences for bookings and search results unless you are pasting tool output (flight or restaurant search results). For general conversation, up to 5 sentences is fine — still SMS-length, not essays.
- No tool call needed for casual chat, questions, opinions, or advice unless the user is clearly asking you to search, book, or look something up.
- When the user sends a screenshot or photo, read it carefully. Common cases: forwarded iMessage threads, reservation confirmations, flight details, menus, maps. Extract useful details and help — book, summarize, draft a reply, or ask one short clarifying question if needed.
- Voice memos arrive as transcribed text — treat them like the user typed it. Respond naturally; do not mention transcription unless something went wrong.
- Plain text only: no Markdown, no asterisks (*), no bold/italics markers, no backticks.
- When search_flights returns a formatted option list, use "formatted" verbatim — do not shorten or reformat flight options.
- When search_restaurants returns "formatted", use it verbatim. Do not add inventory, headers, or a second CTA.
- When get_restaurant_availability returns "formatted", use it verbatim — it is already curated concierge copy. Do not add inventory, headers, or a second CTA.
- Always resolve relative dates (e.g. "Friday", "tonight", "this Saturday") before calling search_flights or search_restaurants.
- When the user says night, dinner, evening, lunch, brunch, or afternoon, pass meal_period on search_restaurants (night/dinner/evening → "night"). Dinner/night slots start at 5pm — never surface 3pm for "Friday night".
- Decide whether the user wants a one-way or round-trip flight. If round-trip, collect both departure_date and return_date before calling search_flights.
- If pending flight options are listed in context below, use them: when the user picks an airline or says first/second/third/fourth/fifth (by position), pick the matching offer_id. Do not ask for dates again if they already gave them or if those options already reflect the trip.
- If the user's message includes [Context: ...] indicating they selected a specific option (by reply or by name/position), treat that option as their selection — do not ask "which one?"
- If pending restaurant options are listed in context below, use them ONLY for venue selection (when the user picks by name or position). If the user's current message asks for a different cuisine, neighborhood, date, party size, or city than the cached search params, you MUST call search_restaurants again with the new parameters — do NOT relabel cached venues as a different cuisine.
- When the user asks "tell me more", "more info", "what's it like", "story", or "what to expect" about a specific restaurant they selected (by name/position), DO NOT call get_restaurant_availability. Instead write a SHORT 2-3 sentence brief — cuisine, vibe, neighborhood, what to expect — using the facts in the [Context: ...] block plus general knowledge ONLY for well-known venues. Never invent dishes, chefs, awards, or history. End softly, e.g. "want to see times?"
- Only call get_restaurant_availability when the user asks for times, availability, or affirms a "Want to see times?" follow-up.
- Before taking action on a specific flight, restate the exact flight (airline, time, price) and ask ONE question: "HOLD or BOOK?"
- Restaurant booking IS LIVE via book_restaurant_table. NEVER say booking is unavailable, coming soon, or tell users to book on resy.com instead — unless the tool returns an error.
- When the user picks a venue AND a time — whether or not they say "book"/"reserve" (e.g. "book the 5:45", "reserve 7pm", "Claudie at 9:30", "the second one at 8") — call book_restaurant_table WITHOUT confirm. Use the tool "formatted" field as your reply. Do NOT book until they reply yes.
- NEVER write a "just to confirm … reply yes" message yourself. That confirmation text comes ONLY from book_restaurant_table's "formatted" field. If you have not called book_restaurant_table (without confirm) this turn, you may not send a confirmation prompt — call the tool first.
- Restaurant confirmation (only after book_restaurant_table returned needs_confirmation and you relayed its "Just to confirm … Reply yes" message): YES intent → book_restaurant_table with confirm=true and the same venue_id, date, party_size, time. NO / wait / nevermind → do not book; ask what they want.
- If only the time is given, use selected_venue_id from restaurant context below, or the sole venue in the list, or the restaurant name from recent messages.

Intent recognition (only after you have just asked "HOLD or BOOK?" on a specific flight):
- BOOK intent (call book_flight with the matching offer_id): "BOOK", "book it", "book please", "please book", "get it", "buy it", "purchase", "lock it in", "do it", "go ahead", "yes", "yep", "yeah", "sure", "ok", "okay", "let's go", "confirm".
- HOLD intent (call hold_flight with the matching offer_id): "HOLD", "hold it", "save it", "reserve it", "pencil it in", "keep it".
- Negative ("no", "not yet", "wait", "nevermind") after a flight HOLD/BOOK question: do not call any tool. Ask what they want.
- Restaurant reservation cancel ("cancel my reservation", "cancel dinner at X", "cancel the 7pm at Bondi"): call cancel_restaurant_reservation (or list_restaurant_reservations first if unclear). Do NOT say they must cancel in the Resy app unless the tool errors.
- If a bare affirmative arrives without a recent "HOLD or BOOK?" question on a specific flight, do not call any tool — ask one clarifying question.

Tool calling discipline (IMPORTANT):
- Tools are for when the user wants something searched, booked, listed, or discovered — not for casual conversation.
- Make AT MOST ONE tool call per user turn. Never call the same tool twice in one turn.
- Do not call search_restaurants more than once per turn. Pick exactly one cuisine/query and one date. If the user gave a cuisine (e.g. "sushi"), use only that — do not also search a backup cuisine.
- Do not call search_flights more than once per turn. Pick exactly one origin/destination/date combo.
- If you are unsure which date or city to use, ASK the user instead of calling the tool with a guess.
- For local recommendations, if vibe/mood is missing or generic, ASK — do not call search_tiktok or search_instagram with guessed keywords.
- Never make speculative parallel tool calls "in case the first returns nothing".

Local recommendations (what's trending) — vibe required before searching:
- If the user only gives a city or something vague ("something fun in Miami", "what's good in NYC") with NO specific mood, do NOT call search_tiktok or search_instagram. Ask what they're in the mood for — one short SMS, e.g. "what are you feeling — dinner, something lively, date night?"
- Only call search_tiktok or search_instagram once they answer with a concrete vibe: music/scene (house, afrobeats, hip-hop, latin), activity type (beach day, boat, art), occasion (date night, romantic dinner, girls night, birthday), food/drink style (brunch, rooftop, speakeasy, clubs), or similar. "Fun" or "cool spots" alone is still too vague — ask again.
- When vibe is clear, call exactly ONE of search_tiktok or search_instagram (not both). Pass location, vibe, and 1-2 TikTok keyword phrases + 1-2 Instagram hashtags that match that vibe (no # needed). Example after they say afrobeats clubs: search_tiktok with location "Miami", vibe "afrobeats clubs", keywords ["miami afrobeats nightlife"], instagram_hashtags ["miamiafrobeats", "miaminightlife"].
- Flight requests → search_flights, hold_flight, book_flight, confirm_booking as appropriate.
- Concerts, sports, theater, tickets, shows, or "what's on" in a city → search_events. Use home_city from profile when the user does not name a city. When search_events returns "formatted", use it verbatim.
- User picks an event or asks for details on one show → get_event_details with event_id from search results.
- Restaurant / table / dinner availability (booking intent) → search_restaurants. If location is missing, ask which city.
- User picks a restaurant from results → get_restaurant_availability with venue_id from the latest search.
- User confirms a staged restaurant reservation (yes after "Just to confirm") → book_restaurant_table with confirm=true.
- User asks about upcoming restaurant bookings → list_restaurant_reservations.
- User cancels a restaurant reservation → cancel_restaurant_reservation with venue_name and/or date, or resy_token after listing.
- BOOK intent → book_flight (charges the user and creates the order in one step; works for any carrier, including Frontier and other instant-payment airlines).
- HOLD intent → hold_flight. If hold_flight returns { error: true, instant_only: true }, tell the user this airline requires instant payment and ask if they want to BOOK now; on BOOK affirmative call book_flight.
- For book_flight / hold_flight, always use an offer_id from the "offers" array in the latest search (or the pending options list in context). Never invent flights, prices, or flight numbers.
- For get_restaurant_availability, always use a venue_id from the latest search_restaurants (or pending restaurant list in context). Never invent venue IDs.

Output formatting:
- When search_flights returns results, use the "formatted" field verbatim. If it has no closing question, add one soft line: "which works?" or "want me to hold one?"
- When search_restaurants or get_restaurant_availability returns "formatted" with no error, use it verbatim. Do not add options or a second question.
- When book_restaurant_table returns needs_confirmation: true, use "formatted" verbatim.
- When book_restaurant_table returns success: true, use "formatted" verbatim (usually starts with "done.").
- When list_restaurant_reservations or cancel_restaurant_reservation returns successfully, use "formatted" verbatim.
- When search_events returns "formatted" with no error, use it verbatim. Do not list extra events or add a second CTA. Remi does not purchase tickets yet — after details, offer to send the Ticketmaster link if one is in the tool output.
- When get_event_details returns "formatted", use it verbatim.
- When search_tiktok or search_instagram returns needs_vibe: true, ask mood in one short SMS. Do not mention tools or APIs.
- When search_tiktok or search_instagram returns items, synthesize at most 2-3 recommendations — never dump raw posts. Never name-drop apps or platforms. Speak like a friend who already looked. After social recommendations, do not ask to book — stop after the recommendations.
- When hold_flight returns successfully, use the "formatted" field verbatim.
- When book_flight returns successfully, keep it brief: "booked. confirmation <booking_reference>." (no exclamation)
- Format prices as "$X" not "$X.XX" unless cents matter.
- If a user's flight request is ambiguous (e.g. no origin city), ask where they are flying from or which departure airport they prefer.

Payments:
- Flight BOOK and confirm_booking require payment on file. If missing, offer search/hold instead and tell them to text "link" to connect Link — never paste signup URLs unless they ask for link/payment setup.
- Stripe Link wallet (link_connect): for merchant checkout and one-time virtual cards. US Link accounts only.
- If the user asks to connect Link, log in to Link, or pay on a random merchant site, use link_auth_status first, then link_connect if needed.
- After link_connect, send the verification_url clearly and ask them to text back when approved; then call link_auth_status (or link_connect with poll on their confirmation — use link_auth_status only, one tool per turn).
- Never paste full card numbers, CVCs, or full shipping addresses in SMS — abbreviate (brand + last4, city + zip only).
- link_payment_methods_list / link_shipping_address_list require an authenticated Link wallet.
- Search, restaurant discovery, holds, and recommendations work even when Link is not connected yet.`;
function linkNotAvailablePayload() {
    return JSON.stringify({
        error: true,
        message: "Link wallet isn't set up on this server yet. Flights and restaurants still work without Link.",
    });
}
function linkToolError(result) {
    const message = result.error?.message ??
        (result.stderr?.trim() ? result.stderr.trim() : 'Link command failed. Try again in a moment.');
    return JSON.stringify({ error: true, message });
}
async function attachFlightCardSafely(ctx, order, formattedPrice, tag) {
    if (SEARCH_PREVIEW_CARD_LIMIT === 0)
        return;
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
async function attachRestaurantPreviewCardsSafely(ctx, venues, meta, tag) {
    if (SEARCH_PREVIEW_CARD_LIMIT === 0 || venues.length === 0)
        return;
    try {
        const images = [];
        for (const [index, venue] of venues.entries()) {
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
                const venue = venues[index];
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
async function executeTool(toolName, input, user, ctx) {
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
        await saveFlightBooking({
            userId: user.id,
            status: 'held',
            bookingReference: order.booking_reference,
            duffelOrderId: order.id,
            duffelOfferId: offerId,
            origin: from,
            destination: to,
            departureDate: order.slices[0]?.departure_date,
            returnDate: order.slices[1]?.departure_date,
            airline,
            totalAmount: order.total_amount,
            totalCurrency: order.total_currency,
            metadata: {
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
                message: "I can't complete paid flight bookings yet — card payments aren't set up. I can still search flights and hold options for you.",
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
        const bookOutSeg = order.slices[0]?.segments[0];
        await saveFlightBooking({
            userId: user.id,
            status: 'confirmed',
            bookingReference: order.booking_reference,
            duffelOrderId: order.id,
            duffelOfferId: offerId,
            origin: order.slices[0]?.origin,
            destination: order.slices[0]?.destination,
            departureDate: order.slices[0]?.departure_date,
            returnDate: order.slices[1]?.departure_date,
            airline: bookOutSeg?.marketing_carrier_name,
            totalAmount: order.total_amount,
            totalCurrency: order.total_currency,
            stripePaymentIntentId: paymentIntentId,
            metadata: {
                offer_get: bookResult.rawOfferGet,
                order_create: bookResult.rawOrderCreate,
                stripe_payment_intent: paymentIntentId,
                charged_amount_cents: amountInCents,
                charged_currency: currency,
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
                message: "I can't complete paid flight bookings yet — card payments aren't set up. I can still search flights and hold options for you.",
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
        let paymentIntentId;
        try {
            paymentIntentId = await chargeViaSPT(user.stripe_spt_id, amountInCents, currency, user.stripe_customer_id);
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
        await confirmFlightBooking({
            userId: user.id,
            duffelOrderId: orderId,
            stripePaymentIntentId: paymentIntentId,
        });
        await clearLastFlightSearch(user.id);
        await clearPendingOrder(user.id);
        return JSON.stringify({ success: true, message: 'Payment processed and booking confirmed.' });
    }
    if (toolName === 'search_events') {
        if (!isTicketmasterConfigured()) {
            return JSON.stringify({
                error: true,
                message: "i can't search live events right now. try again later.",
            });
        }
        const city = input.city?.trim() ||
            user.city?.trim() ||
            undefined;
        if (!city && !input.keyword?.trim()) {
            return JSON.stringify({
                error: true,
                message: 'Which city should I search for events?',
            });
        }
        try {
            const result = await searchEvents(user.id, {
                city,
                stateCode: input.state_code,
                keyword: input.keyword,
                startDateTime: input.start_date_time,
                endDateTime: input.end_date_time,
                segmentName: input.segment_name,
                classificationName: input.classification_name,
            });
            console.log(`[search_events] city=${city ?? ''} count=${result.raw_count}`);
            return JSON.stringify({
                events: result.events,
                formatted: result.formatted,
            });
        }
        catch (err) {
            const message = err instanceof TicketmasterNotConfiguredError
                ? "i can't search live events right now."
                : err instanceof TicketmasterApiError
                    ? err.message
                    : err instanceof Error
                        ? err.message
                        : String(err);
            console.error(`[search_events] ${message}`);
            return JSON.stringify({ error: true, message });
        }
    }
    if (toolName === 'get_event_details') {
        if (!isTicketmasterConfigured()) {
            return JSON.stringify({
                error: true,
                message: "i can't load event details right now.",
            });
        }
        const eventId = String(input.event_id ?? '').trim();
        if (!eventId) {
            return JSON.stringify({ error: true, message: 'Which event should I look up?' });
        }
        try {
            const result = await getEventDetails(user.id, eventId);
            const url = result.event && typeof result.event.url === 'string' ? result.event.url : undefined;
            return JSON.stringify({
                formatted: result.formatted,
                url,
            });
        }
        catch (err) {
            const message = err instanceof TicketmasterApiError
                ? err.message
                : err instanceof Error
                    ? err.message
                    : String(err);
            console.error(`[get_event_details] ${message}`);
            return JSON.stringify({ error: true, message });
        }
    }
    if (toolName === 'search_tiktok' || toolName === 'search_instagram') {
        if (!isMonidConfigured()) {
            return JSON.stringify({
                error: true,
                message: "I can't check social trends right now. Try again in a bit.",
            });
        }
        const location = String(input.location ?? '').trim();
        const vibe = input.vibe?.trim() || undefined;
        const tiktokKeywords = toolName === 'search_tiktok'
            ? (input.keywords ?? [])
            : (input.tiktok_keywords ?? []);
        const instagramHashtags = toolName === 'search_instagram'
            ? (input.hashtags ?? [])
            : (input.instagram_hashtags ?? []);
        if (!location) {
            return JSON.stringify({
                error: true,
                message: 'Which city or neighborhood should I search?',
            });
        }
        if (isVagueSocialVibe(vibe)) {
            return JSON.stringify({
                needs_vibe: true,
                message: 'Ask the user what they are in the mood for before searching — e.g. house, afrobeats, an activity, date night, romantic, brunch, clubs. Do not call this tool again until they answer with something specific.',
            });
        }
        try {
            const discovery = await runSocialDiscovery({
                location,
                vibe,
                tiktokKeywords,
                instagramHashtags,
            });
            const payload = formatSocialDiscoveryForTool(discovery);
            console.log(`[${toolName}] location=${location} items=${payload.items.length} both_empty=${payload.both_empty}`);
            return JSON.stringify(payload);
        }
        catch (err) {
            const message = err instanceof MonidNotConfiguredError
                ? "I can't check social trends right now. Try again in a bit."
                : err instanceof MonidApiError
                    ? err.message
                    : err instanceof Error
                        ? err.message
                        : String(err);
            console.error(`[${toolName}] ${message}`);
            return JSON.stringify({
                both_empty: true,
                fallback_message: 'Nothing trending there right now — want me to search somewhere specific?',
                items: [],
                guidance: 'Reply with fallback_message only. Do not mention APIs, platforms, or search failures.',
            });
        }
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
        const mealPeriod = normalizeMealPeriod(input.meal_period) ?? parseMealPeriodFromText(ctx.userMessage);
        try {
            let venues = await searchRestaurants({ location, date, partySize, query });
            let queryRelaxed = false;
            if (venues.length === 0 && query) {
                venues = await searchRestaurants({ location, date, partySize });
                queryRelaxed = true;
            }
            if (mealPeriod) {
                venues = filterVenuesByMealPeriod(venues, mealPeriod);
            }
            const surfaced = surfacedRestaurantVenues(venues);
            const mealLabel = mealPeriod ? mealPeriodLabel(mealPeriod) : undefined;
            let formatted = restaurantsToSMS(surfaced, { location, date, partySize, mealPeriod });
            if (queryRelaxed && surfaced.length > 0) {
                formatted = `No exact match for "${query}" — here's what's open:\n\n${formatted}`;
            }
            if (mealPeriod && surfaced.length === 0) {
                formatted = `${formatted}\n\nWant me to check the full day instead?`;
            }
            await attachRestaurantPreviewCardsSafely(ctx, surfaced, { date, partySize }, `search:${location}`);
            const saved = await setLastRestaurantSearch(user.id, {
                venues: summarizeVenuesForContext(surfaced),
                updated_at: new Date().toISOString(),
                search_params: {
                    location,
                    date,
                    party_size: partySize,
                    query,
                    meal_period: mealLabel,
                },
            });
            if (!saved) {
                console.warn('[search_restaurants] results ok but last_restaurant_search not persisted (run Supabase migration?)');
            }
            return JSON.stringify({
                formatted,
                venues: slimVenuesForTool(surfaced),
                meal_period: mealLabel ?? null,
            });
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
            let venue = await getRestaurantAvailability({
                venueId,
                date,
                partySize,
                location: searchParams?.location,
            });
            if (!venue) {
                return JSON.stringify({
                    error: true,
                    message: `No availability found for venue ${venueId} on ${date} for ${partySize}.`,
                });
            }
            const mealPeriod = normalizeMealPeriod(searchParams?.meal_period) ?? parseMealPeriodFromText(ctx.userMessage);
            if (mealPeriod) {
                const filtered = filterSlotsByMealPeriod(venue.slots, mealPeriod);
                if (filtered.length === 0) {
                    return JSON.stringify({
                        error: true,
                        message: `No ${mealPeriodLabel(mealPeriod)} times at ${venue.name} on ${date}. Want me to check the full day?`,
                    });
                }
                venue = { ...venue, slots: filtered };
            }
            const formatted = restaurantDetailToSMS(venue, mealPeriod);
            if (user.last_restaurant_search?.search_params) {
                const refreshedVenues = (user.last_restaurant_search.venues ?? []).map((v) => v.venue_id === venueId ? summarizeVenuesForContext([venue])[0] : v);
                await setLastRestaurantSearch(user.id, {
                    ...user.last_restaurant_search,
                    venues: refreshedVenues,
                    selected_venue_id: venueId,
                    updated_at: new Date().toISOString(),
                });
            }
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
    if (toolName === 'book_restaurant_table') {
        if (!isResyConfigured()) {
            return JSON.stringify({
                error: true,
                message: 'Dining search is temporarily unavailable. Try again later.',
            });
        }
        const confirm = input.confirm === true;
        const venueId = input.venue_id;
        const time = input.time?.trim();
        const searchParams = user.last_restaurant_search?.search_params;
        const partySize = input.party_size ?? searchParams?.party_size ?? 2;
        const date = input.date || searchParams?.date;
        if (!date || !time) {
            return JSON.stringify({
                error: true,
                message: 'Need a date and time to book. Show availability first, then ask the user to pick a time.',
            });
        }
        const allowedIds = user.last_restaurant_search?.venues?.map((v) => v.venue_id) ?? [];
        if (allowedIds.length > 0 && !allowedIds.includes(venueId)) {
            return JSON.stringify({
                error: true,
                message: 'That venue_id is not in the latest search. Call search_restaurants again, then book only for a venue from those results.',
            });
        }
        try {
            const pending = user.pending_restaurant_booking;
            if (confirm) {
                if (!pending ||
                    pending.venue_id !== venueId ||
                    pending.date !== date ||
                    pending.party_size !== partySize) {
                    return JSON.stringify({
                        error: true,
                        message: 'No matching reservation to confirm. Ask them what they want to book, then call book_restaurant_table without confirm first.',
                    });
                }
                const booked = await reserveRestaurantTable({
                    configToken: pending.config_token,
                    date,
                    partySize,
                });
                const formatted = formatReservationConfirmationSMS({
                    venueName: pending.venue_name,
                    date,
                    time: pending.time,
                    partySize,
                    confirmation: booked.confirmation,
                    seatingType: pending.slot_type,
                    address: pending.address,
                });
                console.log(`[book_restaurant_table] booked venue=${venueId} time=${pending.time} conf=${booked.confirmation ?? 'n/a'}`);
                await saveRestaurantBooking({
                    userId: user.id,
                    venueId,
                    venueName: pending.venue_name,
                    reservationDate: date,
                    reservationTime: pending.time,
                    partySize,
                    resyToken: booked.resyToken,
                    confirmationCode: booked.confirmation,
                    location: pending.address ?? searchParams?.location,
                    seatingType: pending.slot_type,
                    metadata: {
                        config_token: pending.config_token,
                        payment_method_id: booked.paymentMethodId,
                    },
                });
                await clearPendingRestaurantBooking(user.id);
                return JSON.stringify({
                    success: true,
                    formatted,
                    confirmation: booked.confirmation,
                    venue_name: pending.venue_name,
                    time: pending.time,
                });
            }
            const venue = await getRestaurantAvailability({
                venueId,
                date,
                partySize,
                location: searchParams?.location,
            });
            if (!venue) {
                return JSON.stringify({
                    error: true,
                    message: `No availability for that restaurant on ${date} for ${partySize}. Try another date or spot.`,
                });
            }
            const slot = findVenueSlotByTime(venue, time);
            if (!slot?.config_token) {
                const sample = venue.slots
                    .slice(0, 5)
                    .map((s) => s.time)
                    .filter(Boolean)
                    .join(', ');
                return JSON.stringify({
                    error: true,
                    message: `Couldn't match "${time}" at ${venue.name}. Available times include: ${sample || 'none'}.`,
                });
            }
            const staged = {
                venue_id: venueId,
                venue_name: venue.name,
                date,
                time: slot.time,
                party_size: partySize,
                config_token: slot.config_token,
                slot_type: slot.slot_type,
                address: venue.address,
                updated_at: new Date().toISOString(),
            };
            await setPendingRestaurantBooking(user.id, staged);
            const formatted = formatRestaurantBookingConfirmPromptSMS({
                venueName: venue.name,
                date,
                time: slot.time,
                partySize,
                address: venue.address,
            });
            console.log(`[book_restaurant_table] staged confirm venue=${venueId} time=${slot.time}`);
            return JSON.stringify({
                needs_confirmation: true,
                formatted,
                pending: {
                    venue_id: venueId,
                    venue_name: venue.name,
                    date,
                    time: slot.time,
                    party_size: partySize,
                },
            });
        }
        catch (err) {
            const message = formatResyError(err);
            console.error(`[book_restaurant_table] ${message}`);
            if (confirm) {
                await clearPendingRestaurantBooking(user.id);
            }
            const slotGone = err instanceof ResyApiError &&
                (err.status === 410 ||
                    /no longer available|slot|taken|invalid book token/i.test(err.message));
            return JSON.stringify({
                error: true,
                slot_taken: slotGone,
                message: slotGone
                    ? `That time just got taken. Want me to pull fresh times?`
                    : message,
            });
        }
    }
    if (toolName === 'list_restaurant_reservations') {
        if (!isResyConfigured()) {
            return JSON.stringify({
                error: true,
                message: 'Dining is temporarily unavailable. Try again later.',
            });
        }
        try {
            const dbBookings = await getActiveRestaurantBookings(user.id);
            let resyUpcoming = [];
            try {
                resyUpcoming = await listUpcomingReservations();
            }
            catch (err) {
                console.warn('[list_restaurant_reservations] Resy list failed:', formatResyError(err));
            }
            const byToken = new Map();
            for (const b of dbBookings) {
                byToken.set(b.resy_token, {
                    venue_name: b.venue_name,
                    date: b.reservation_date,
                    time: b.reservation_time,
                    party_size: b.party_size,
                });
            }
            for (const r of resyUpcoming) {
                if (!byToken.has(r.resy_token)) {
                    byToken.set(r.resy_token, {
                        venue_name: r.venue_name,
                        date: r.date,
                        time: r.time,
                        party_size: r.party_size,
                    });
                }
            }
            const reservations = [...byToken.entries()].map(([resy_token, item], idx) => ({
                index: idx + 1,
                resy_token,
                ...item,
            }));
            const formatted = reservationsListToSMS(reservations);
            return JSON.stringify({
                success: true,
                formatted,
                reservations,
            });
        }
        catch (err) {
            return JSON.stringify({ error: true, message: formatResyError(err) });
        }
    }
    if (toolName === 'cancel_restaurant_reservation') {
        if (!isResyConfigured()) {
            return JSON.stringify({
                error: true,
                message: 'Dining is temporarily unavailable. Try again later.',
            });
        }
        const resyTokenInput = input.resy_token?.trim();
        const venueName = input.venue_name?.trim();
        const date = input.date?.trim();
        try {
            const dbBookings = await getActiveRestaurantBookings(user.id);
            let resyUpcoming = [];
            try {
                resyUpcoming = await listUpcomingReservations();
            }
            catch (err) {
                console.warn('[cancel_restaurant_reservation] Resy list failed:', formatResyError(err));
            }
            const pick = resolveReservationToCancel({
                resyToken: resyTokenInput,
                venueName,
                date,
                dbBookings,
                resyUpcoming,
            });
            if (pick.kind === 'none') {
                return JSON.stringify({ error: true, message: pick.message });
            }
            if (pick.kind === 'ambiguous') {
                const formatted = reservationsListToSMS(pick.options);
                return JSON.stringify({
                    error: true,
                    ambiguous: true,
                    formatted: `${formatted}\n\nWhich should I cancel? Reply with the name.`,
                    options: pick.options,
                });
            }
            await cancelReservation(pick.resy_token);
            await markRestaurantBookingCancelled({ userId: user.id, resyToken: pick.resy_token });
            const formatted = formatReservationCancellationSMS({
                venueName: pick.venue_name,
                date: pick.date,
                time: pick.time,
            });
            console.log(`[cancel_restaurant_reservation] cancelled ${pick.label}`);
            return JSON.stringify({ success: true, formatted, cancelled: pick.label });
        }
        catch (err) {
            const message = formatResyError(err);
            console.error(`[cancel_restaurant_reservation] ${message}`);
            return JSON.stringify({ error: true, message });
        }
    }
    if (toolName === 'link_auth_status') {
        if (!isLinkCliInstalled())
            return linkNotAvailablePayload();
        const poll = Boolean(input.poll_until_authenticated);
        const result = poll
            ? await linkAuthPoll(user.id, input.max_attempts ?? 12)
            : await linkAuthStatus(user.id);
        if (!result.ok)
            return linkToolError(result);
        const status = formatLinkAuthStatus(result.parsed);
        if (status.authenticated) {
            await persistLinkAuthFile(user.id);
        }
        return JSON.stringify({
            authenticated: status.authenticated,
            link_connected_at: user.link_connected_at ?? null,
            guidance: status.authenticated
                ? 'User has Link connected. You can call link_payment_methods_list or link_shipping_address_list.'
                : 'User is not connected to Link yet. Call link_connect to start.',
        });
    }
    if (toolName === 'link_connect') {
        if (!isLinkCliInstalled())
            return linkNotAvailablePayload();
        const statusResult = await linkAuthStatus(user.id);
        if (statusResult.ok) {
            const status = formatLinkAuthStatus(statusResult.parsed);
            if (status.authenticated) {
                await persistLinkAuthFile(user.id);
                return JSON.stringify({
                    already_connected: true,
                    message: 'Your Link wallet is already connected to Remi.',
                });
            }
        }
        const loginResult = await linkAuthLogin(user.id);
        if (!loginResult.ok)
            return linkToolError(loginResult);
        const login = formatLinkLoginResponse(loginResult.parsed);
        if (!login.verification_url) {
            return JSON.stringify({
                error: true,
                message: 'Could not start Link connection. Try again in a moment.',
            });
        }
        await setLinkConnectPending(user.id);
        return JSON.stringify({
            verification_url: login.verification_url,
            phrase: login.phrase,
            formatted: `Connect your Link wallet here: ${login.verification_url}${login.phrase ? `\n\nWhen prompted, enter this phrase: ${login.phrase}` : ''}\n\nText me when you've approved it.`,
            guidance: 'Send the formatted message to the user. When they confirm approval, call link_auth_status with poll_until_authenticated true on the next turn.',
        });
    }
    if (toolName === 'link_payment_methods_list') {
        if (!isLinkCliInstalled())
            return linkNotAvailablePayload();
        const result = await linkPaymentMethodsList(user.id);
        if (!result.ok) {
            const msg = result.error?.message ?? '';
            if (/not authenticated|login|auth/i.test(msg)) {
                return JSON.stringify({
                    error: true,
                    needs_link_connect: true,
                    message: 'Link wallet not connected yet. Call link_connect first.',
                });
            }
            return linkToolError(result);
        }
        return JSON.stringify({ payment_methods: result.parsed });
    }
    if (toolName === 'link_shipping_address_list') {
        if (!isLinkCliInstalled())
            return linkNotAvailablePayload();
        const result = await linkShippingAddressList(user.id);
        if (!result.ok) {
            const msg = result.error?.message ?? '';
            if (/not authenticated|login|auth/i.test(msg)) {
                return JSON.stringify({
                    error: true,
                    needs_link_connect: true,
                    message: 'Link wallet not connected yet. Call link_connect first.',
                });
            }
            return linkToolError(result);
        }
        return JSON.stringify({ shipping_addresses: result.parsed });
    }
    throw new Error(`Unknown tool: ${toolName}`);
}
function buildUserMessageContent(userMessage, images) {
    if (!images?.length)
        return userMessage;
    const blocks = images.map((img) => ({
        type: 'image',
        source: {
            type: 'base64',
            media_type: img.mediaType,
            data: img.buffer.toString('base64'),
        },
    }));
    const trimmed = userMessage.trim();
    blocks.push({
        type: 'text',
        text: trimmed || IMAGE_ONLY_USER_HINT,
    });
    return blocks;
}
export async function runAgentLoop(userMessage, history, user, options = {}) {
    const flightPending = formatLastSearchForPrompt(user.last_flight_search ?? undefined);
    const restaurantPending = formatLastRestaurantSearchForPrompt(user.last_restaurant_search ?? undefined);
    const restaurantConfirmPending = formatPendingRestaurantBookingForPrompt(user.pending_restaurant_booking ?? undefined);
    const profileContext = user.city?.trim()
        ? `User profile: name=${user.name}, home_city=${user.city.trim()}. Default restaurant and local discovery searches to ${user.city.trim()} unless the user specifies another location.`
        : user.name
            ? `User profile: name=${user.name}.`
            : '';
    const linkPending = !isLinkWalletConnected(user) ? formatLinkPendingContext(user) : '';
    const contextParts = [profileContext, linkPending, flightPending, restaurantPending, restaurantConfirmPending].filter(Boolean);
    const todayISO = new Date().toISOString().split('T')[0];
    const dateHint = userMessage.trim() || (options.images?.length ? 'screenshot' : '');
    const resolved = resolveRelativeDates(dateHint, todayISO);
    const systemBase = contextParts.length ? `${SYSTEM_PROMPT}\n\n${contextParts.join('\n\n')}` : SYSTEM_PROMPT;
    const system = resolved.changed
        ? `${systemBase}\n\nRelative date resolution: Interpret the user's last message as: "${resolved.resolvedText}".`
        : systemBase;
    const messages = [
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: buildUserMessageContent(userMessage, options.images) },
    ];
    const ctx = { attachments: [], userMessage: userMessage.trim() || dateHint };
    let modelRound = 0;
    while (true) {
        modelRound += 1;
        const response = await createMessageWithRetries({
            model: 'claude-sonnet-4-6',
            max_tokens: 1024,
            system,
            tools,
            tool_choice: { type: 'auto', disable_parallel_tool_use: true },
            messages,
        });
        if (response.stop_reason === 'end_turn') {
            sessionModelRound({ round: modelRound, stopReason: 'end_turn' });
            const textBlock = response.content.find((b) => b.type === 'text');
            return { text: textBlock?.text ?? '', attachments: ctx.attachments };
        }
        if (response.stop_reason === 'tool_use') {
            const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');
            sessionModelRound({
                round: modelRound,
                stopReason: 'tool_use',
                toolNames: toolUseBlocks.map((b) => b.name),
            });
            messages.push({ role: 'assistant', content: response.content });
            const toolResults = await Promise.all(toolUseBlocks.map(async (block) => {
                const started = Date.now();
                try {
                    const result = await executeTool(block.name, block.input, user, ctx);
                    sessionToolLog(block.name, block.input, result, {
                        ok: true,
                        durationMs: Date.now() - started,
                    });
                    return { type: 'tool_result', tool_use_id: block.id, content: result };
                }
                catch (err) {
                    const message = formatDuffelError(err);
                    const errorPayload = `Error: ${message}`;
                    sessionToolLog(block.name, block.input, errorPayload, {
                        ok: false,
                        durationMs: Date.now() - started,
                        isError: true,
                    });
                    console.error(`[tool] ${block.name} threw:`, message);
                    return {
                        type: 'tool_result',
                        tool_use_id: block.id,
                        content: errorPayload,
                        is_error: true,
                    };
                }
            }));
            messages.push({ role: 'user', content: toolResults });
            continue;
        }
        sessionModelRound({ round: modelRound, stopReason: response.stop_reason ?? 'unknown' });
        throw new Error(`Unexpected stop_reason: ${response.stop_reason}`);
    }
}
