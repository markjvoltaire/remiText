import { Duffel } from '@duffel/api';
import { computeAllInPrice, logPriceBreakdown } from '../utils/pricing.js';
/** `DUFFEL_ENV=live|production|prod` uses live token; anything else (including unset) uses test. */
export function getDuffelEnvironment() {
    const raw = process.env.DUFFEL_ENV?.trim().toLowerCase();
    if (raw === 'live' || raw === 'production' || raw === 'prod')
        return 'live';
    return 'test';
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
    const offers = (data.offers ?? []).slice(0, 5);
    const mapped = offers.map((o) => {
        const offer = {
            id: o.id,
            total_amount: o.total_amount,
            total_currency: o.total_currency,
            expires_at: o.expires_at,
            slices: o.slices.map((s) => ({
                origin: s.origin.iata_code ?? '',
                destination: s.destination.iata_code ?? '',
                departure_date: s.segments[0]?.departing_at?.split('T')[0] ?? params.departure_date,
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
        logPriceBreakdown('search', computeAllInPrice(offer.total_amount, offer.total_currency), {
            offer_id: offer.id,
        });
        return offer;
    });
    return { offers: mapped, rawOfferRequest };
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
