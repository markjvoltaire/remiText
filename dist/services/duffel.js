import { Duffel } from '@duffel/api';
import { computeAllInPrice, logPriceBreakdown } from '../utils/pricing.js';
/** `DUFFEL_ENV=live` uses live token; anything else (including unset) uses test. */
export function getDuffelEnvironment() {
    const raw = process.env.DUFFEL_ENV?.trim().toLowerCase();
    return raw === 'live' ? 'live' : 'test';
}
function getDuffelApiKey(mode) {
    if (mode === 'live') {
        const key = process.env.DUFFEL_API_KEY_PROD?.trim();
        if (!key)
            throw new Error('Missing DUFFEL_API_KEY_PROD (set DUFFEL_ENV=live)');
        return key;
    }
    const key = process.env.DUFFEL_API_KEY?.trim();
    if (!key)
        throw new Error('Missing DUFFEL_API_KEY (Duffel test token)');
    return key;
}
function tokenHint(token) {
    const prefix = token.slice(0, 12);
    if (prefix.startsWith('duffel_test_'))
        return 'duffel_test_…';
    if (prefix.startsWith('duffel_live_'))
        return 'duffel_live_…';
    return `${prefix}…`;
}
const duffelMode = getDuffelEnvironment();
const duffelApiKey = getDuffelApiKey(duffelMode);
console.log(`[duffel] environment=${duffelMode} token=${tokenHint(duffelApiKey)}`);
if (duffelMode === 'test' && duffelApiKey.startsWith('duffel_live_')) {
    console.warn('[duffel] DUFFEL_ENV=test but token looks live — use a duffel_test_ key in DUFFEL_API_KEY');
}
if (duffelMode === 'live' && duffelApiKey.startsWith('duffel_test_')) {
    console.warn('[duffel] DUFFEL_ENV=live but token looks like test — use DUFFEL_API_KEY_PROD');
}
const duffel = new Duffel({ token: duffelApiKey });
/** Max bookable offers kept after sorting the full Duffel result set. */
const SEARCH_RESULT_LIMIT = Math.max(5, Math.min(50, Number.parseInt(process.env.REMI_FLIGHT_SEARCH_LIMIT ?? '20', 10) || 20));
/** Max legs surfaced per step (departures / returns) in the leg-by-leg flow. */
const FLIGHT_LEG_LIMIT = Math.max(1, Math.min(8, Number.parseInt(process.env.REMI_FLIGHT_LEG_LIMIT ?? '5', 10) || 5));
/** Clone Duffel `data` payloads for JSONB storage / logs without mutation surprises. */
export function serializeDuffelData(data) {
    return JSON.parse(JSON.stringify(data));
}
/** Full API bodies for Render/host logs (lines can be large). */
function logDuffelPayload(tag, payload) {
    try {
        console.log(`[duffel] ${tag}`, JSON.stringify(payload));
    }
    catch {
        console.log(`[duffel] ${tag}`, '(serialize failed)');
    }
}
/**
 * Thrown when callers attempt `pay_later` on an offer that Duffel only
 * permits via `instant` payment (most low-cost carriers, e.g. Frontier).
 */
export class OfferRequiresInstantPaymentError extends Error {
    offerId;
    amount;
    currency;
    constructor(offerId, amount, currency) {
        super(`Offer ${offerId} requires instant payment and cannot be held`);
        this.name = 'OfferRequiresInstantPaymentError';
        this.offerId = offerId;
        this.amount = amount;
        this.currency = currency;
    }
}
export async function searchFlights(params) {
    const slices = [
        {
            origin: params.origin,
            destination: params.destination,
            departure_date: params.departure_date,
            arrival_time: null,
            departure_time: null,
        },
        ...(params.return_date
            ? [
                {
                    origin: params.destination,
                    destination: params.origin,
                    departure_date: params.return_date,
                    arrival_time: null,
                    departure_time: null,
                },
            ]
            : []),
    ];
    const { data } = await duffel.offerRequests.create({
        slices,
        passengers: Array.from({ length: params.adult_count ?? 1 }, () => ({ type: 'adult' })),
        cabin_class: params.cabin_class ?? 'economy',
        return_offers: true,
    });
    const rawOfferRequest = serializeDuffelData(data);
    logDuffelPayload('POST /air/offer_requests data', rawOfferRequest);
    // Sort the FULL offer list by all-in price BEFORE trimming, so the cheapest
    // bookable fares are surfaced even when Duffel returns them out of order.
    const mapped = sortOffersByAllInPrice((data.offers ?? []).map((o) => mapDuffelOffer(o, params.departure_date))).slice(0, SEARCH_RESULT_LIMIT);
    for (const offer of mapped) {
        logPriceBreakdown('search', computeAllInPrice(offer.total_amount, offer.total_currency), {
            offer_id: offer.id,
        });
    }
    return { offers: mapped, rawOfferRequest };
}
/** Map a Duffel offer (any slice count) into the internal `FlightOffer` shape. */
function mapDuffelOffer(o, fallbackDate) {
    return {
        id: o.id,
        total_amount: o.total_amount,
        total_currency: o.total_currency,
        expires_at: o.expires_at ?? '',
        slices: o.slices.map((s) => ({
            origin: s.origin.iata_code ?? '',
            destination: s.destination.iata_code ?? '',
            departure_date: s.segments[0]?.departing_at?.split('T')[0] ?? fallbackDate,
            segments: s.segments.map((seg) => ({
                departing_at: seg.departing_at,
                arriving_at: seg.arriving_at,
                marketing_carrier_name: seg.marketing_carrier.name,
                marketing_carrier_logo_lockup_url: seg.marketing_carrier.logo_lockup_url ?? undefined,
                flight_number: `${seg.marketing_carrier.iata_code}${seg.marketing_carrier_flight_number}`,
                origin: { iata_code: seg.origin.iata_code ?? '' },
                destination: { iata_code: seg.destination.iata_code ?? '' },
            })),
        })),
    };
}
/** Cheapest-first by all-in charge cents (includes Remi markup). */
function sortOffersByAllInPrice(offers) {
    return [...offers].sort((a, b) => computeAllInPrice(a.total_amount, a.total_currency).chargeAmountCents -
        computeAllInPrice(b.total_amount, b.total_currency).chargeAmountCents);
}
/** Map a single-slice partial offer into a `FlightLeg`, with fallback date. */
function mapPartialOfferToLeg(o, fallbackDate) {
    const slice = o.slices[0];
    if (!slice)
        return null;
    const segments = slice.segments;
    const first = segments[0];
    const last = segments[segments.length - 1];
    if (!first || !last)
        return null;
    return {
        partial_offer_id: o.id,
        origin: slice.origin.iata_code ?? first.origin.iata_code ?? '',
        destination: slice.destination.iata_code ?? last.destination.iata_code ?? '',
        departure_date: first.departing_at?.split('T')[0] ?? fallbackDate,
        airline: first.marketing_carrier.name,
        marketing_carrier_logo_lockup_url: first.marketing_carrier.logo_lockup_url ?? undefined,
        flight_number: `${first.marketing_carrier.iata_code}${first.marketing_carrier_flight_number}`,
        departing_at: first.departing_at,
        arriving_at: last.arriving_at,
        stops: Math.max(0, segments.length - 1),
        amount: o.total_amount,
        currency: o.total_currency,
    };
}
/** Cheapest-first legs by all-in charge cents, then trim to the leg limit. */
function surfaceLegs(legs) {
    return [...legs]
        .sort((a, b) => computeAllInPrice(a.amount, a.currency).chargeAmountCents -
        computeAllInPrice(b.amount, b.currency).chargeAmountCents)
        .slice(0, FLIGHT_LEG_LIMIT);
}
/**
 * Create a multi-step (partial offer) round-trip search. Returns the
 * partial offer request id plus the cheapest outbound legs (slice 0). The
 * caller stores the request id and later fetches return options keyed off the
 * selected outbound partial offer id.
 */
export async function createPartialSearch(params) {
    const { data } = await duffel.partialOfferRequests.create({
        slices: [
            {
                origin: params.origin,
                destination: params.destination,
                departure_date: params.departure_date,
                arrival_time: null,
                departure_time: null,
            },
            {
                origin: params.destination,
                destination: params.origin,
                departure_date: params.return_date,
                arrival_time: null,
                departure_time: null,
            },
        ],
        passengers: Array.from({ length: params.adult_count ?? 1 }, () => ({ type: 'adult' })),
        cabin_class: params.cabin_class ?? 'economy',
    });
    logDuffelPayload('POST /air/partial_offer_requests data', serializeDuffelData(data));
    const legs = (data.offers ?? [])
        .map((o) => mapPartialOfferToLeg(o, params.departure_date))
        .filter((l) => l !== null);
    return {
        partialOfferRequestId: data.id,
        outboundLegs: surfaceLegs(legs),
    };
}
/**
 * Fetch return legs (slice 1) for a previously created partial search, keyed
 * off the selected outbound partial offer id.
 */
export async function getReturnOptions(partialOfferRequestId, selectedOutboundId, fallbackDate) {
    const { data } = await duffel.partialOfferRequests.get(partialOfferRequestId, {
        'selected_partial_offer[]': [selectedOutboundId],
    });
    const legs = (data.offers ?? [])
        .map((o) => mapPartialOfferToLeg(o, fallbackDate))
        .filter((l) => l !== null);
    return surfaceLegs(legs);
}
/**
 * Combine the selected outbound + return partial offers into bookable full
 * offers (two slices). The cheapest is what we hand to the existing book path.
 */
export async function getCombinedFare(partialOfferRequestId, selectedPartialOfferIds, fallbackDate) {
    const { data } = await duffel.partialOfferRequests.getFaresById(partialOfferRequestId, {
        'selected_partial_offer[]': selectedPartialOfferIds,
    });
    logDuffelPayload(`GET /air/partial_offer_requests/${partialOfferRequestId}/fares data`, serializeDuffelData(data));
    return sortOffersByAllInPrice((data.offers ?? []).map((o) => mapDuffelOffer(o, fallbackDate)));
}
async function fetchOfferDetails(offerId) {
    const offer = await duffel.offers.get(offerId);
    const data = offer.data;
    return {
        offer: data,
        passengerId: data.passengers[0].id,
        amount: data.total_amount,
        currency: data.total_currency,
        requiresInstantPayment: data.payment_requirements?.requires_instant_payment ?? false,
    };
}
/**
 * Fetch just the price/currency for an offer. Cheap wrapper used by the
 * book_flight handler so it can charge Stripe with the exact decimal amount
 * before creating the Duffel order.
 */
export async function getOfferPricing(offerId) {
    const details = await fetchOfferDetails(offerId);
    return {
        amount: details.amount,
        currency: details.currency,
        requiresInstantPayment: details.requiresInstantPayment,
    };
}
function buildPassengerPayload(passengerId, passenger) {
    return {
        id: passengerId,
        title: passenger.title,
        gender: passenger.gender,
        given_name: passenger.given_name,
        family_name: passenger.family_name,
        born_on: passenger.date_of_birth,
        email: passenger.email,
        phone_number: passenger.phone_number,
        ...(passenger.passport_number
            ? {
                identity_documents: [
                    {
                        type: 'passport',
                        unique_identifier: passenger.passport_number,
                        expires_on: '2030-01-01',
                        issuing_country_code: 'US',
                    },
                ],
            }
            : {}),
    };
}
function buildHeldOrder(data, offerData) {
    return {
        id: data.id,
        booking_reference: data.booking_reference,
        total_amount: data.total_amount,
        total_currency: data.total_currency,
        slices: offerData.slices.map((s) => ({
            origin: s.origin.iata_code ?? '',
            destination: s.destination.iata_code ?? '',
            departure_date: s.segments[0]?.departing_at?.split('T')[0] ?? '',
            segments: s.segments.map((seg) => ({
                departing_at: seg.departing_at,
                arriving_at: seg.arriving_at,
                marketing_carrier_name: seg.marketing_carrier.name,
                marketing_carrier_logo_lockup_url: seg.marketing_carrier.logo_lockup_url ?? undefined,
                flight_number: `${seg.marketing_carrier.iata_code}${seg.marketing_carrier_flight_number}`,
                origin: { iata_code: seg.origin.iata_code ?? '' },
                destination: { iata_code: seg.destination.iata_code ?? '' },
            })),
        })),
    };
}
/**
 * Reserve a Duffel offer with `pay_later`. Throws
 * {@link OfferRequiresInstantPaymentError} if the offer doesn't allow it,
 * so callers can surface a friendly "this offer can only be BOOKed" message
 * instead of the raw 422 from Duffel.
 */
export async function holdOrder(offerId, passenger) {
    const details = await fetchOfferDetails(offerId);
    const rawOfferGet = serializeDuffelData(details.offer);
    logDuffelPayload(`GET /air/offers/${offerId} data`, rawOfferGet);
    if (details.requiresInstantPayment) {
        throw new OfferRequiresInstantPaymentError(offerId, details.amount, details.currency);
    }
    const { data } = await duffel.orders.create({
        type: 'pay_later',
        selected_offers: [offerId],
        passengers: [buildPassengerPayload(details.passengerId, passenger)],
    });
    const rawOrderCreate = serializeDuffelData(data);
    logDuffelPayload('POST /air/orders data (pay_later)', rawOrderCreate);
    return {
        order: buildHeldOrder(data, details.offer),
        rawOfferGet,
        rawOrderCreate,
    };
}
/**
 * Create a fully paid Duffel order in one request: `type: 'instant'` with
 * `payments: [{ type: 'balance', amount, currency }]`. Used for the BOOK
 * flow, including instant-payment carriers like Frontier.
 *
 * Caller is responsible for collecting money from the end user (e.g. via
 * Stripe) BEFORE calling this and refunding on failure — Duffel here pulls
 * funds from the merchant's pre-funded Duffel balance.
 */
export async function bookOrderInstant(offerId, passenger) {
    const details = await fetchOfferDetails(offerId);
    const rawOfferGet = serializeDuffelData(details.offer);
    logDuffelPayload(`GET /air/offers/${offerId} data`, rawOfferGet);
    const { data } = await duffel.orders.create({
        type: 'instant',
        selected_offers: [offerId],
        passengers: [buildPassengerPayload(details.passengerId, passenger)],
        payments: [
            {
                type: 'balance',
                amount: details.amount,
                currency: details.currency,
            },
        ],
    });
    const rawOrderCreate = serializeDuffelData(data);
    logDuffelPayload('POST /air/orders data (instant)', rawOrderCreate);
    return {
        order: buildHeldOrder(data, details.offer),
        rawOfferGet,
        rawOrderCreate,
    };
}
export async function payForOrderWithBalance(orderId, amount, currency) {
    await duffel.payments.create({
        order_id: orderId,
        payment: {
            type: 'balance',
            amount,
            currency,
        },
    });
}
