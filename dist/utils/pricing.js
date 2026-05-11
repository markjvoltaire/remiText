function parseAmountToCents(amount) {
    const n = Number.parseFloat(amount);
    if (!Number.isFinite(n))
        return 0;
    return Math.round(n * 100);
}
function getMarkupFlatCents() {
    const raw = process.env.REMI_MARKUP_FLAT_CENTS ?? process.env.REMI_BOOKING_FEE_CENTS ?? '0';
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
}
function getMarkupPercent() {
    const raw = process.env.REMI_MARKUP_PERCENT ?? '0';
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
}
function roundUpToDollar(cents) {
    if (cents <= 0)
        return 0;
    return Math.ceil(cents / 100) * 100;
}
/**
 * Pricing strategy:
 * - Default: "ota" = max( ceil(fare*1.04), fare + $3 ) then round up to $1.
 *   This is designed to cover Stripe (2.9% + $0.30) + ~2¢ SMS reliably.
 * - Optional override: "markup" = fare + flat + percent (env-driven).
 */
export function computeAllInPrice(duffelAmount, currency) {
    const ccy = (currency || 'usd').toLowerCase();
    const duffelAmountCents = parseAmountToCents(duffelAmount);
    const mode = (process.env.REMI_PRICING_MODE ?? 'ota').toLowerCase();
    let chargeAmountCents;
    if (mode === 'markup') {
        const flat = getMarkupFlatCents();
        const pct = getMarkupPercent();
        const pctCents = Math.round(duffelAmountCents * pct);
        chargeAmountCents = duffelAmountCents + flat + pctCents;
    }
    else {
        const pct = Number.parseFloat(process.env.REMI_OTA_PERCENT ?? '0.04');
        const minAddCents = Number.parseInt(process.env.REMI_OTA_MIN_ADD_CENTS ?? '300', 10);
        const pctSafe = Number.isFinite(pct) ? Math.max(0, pct) : 0.04;
        const minSafe = Number.isFinite(minAddCents) ? Math.max(0, minAddCents) : 300;
        const pctPrice = Math.ceil(duffelAmountCents * (1 + pctSafe));
        const minPrice = duffelAmountCents + minSafe;
        chargeAmountCents = Math.max(pctPrice, minPrice);
        const round = (process.env.REMI_ROUND_TO_DOLLAR ?? 'true').toLowerCase();
        if (round !== 'false' && round !== '0' && round !== 'no') {
            chargeAmountCents = roundUpToDollar(chargeAmountCents);
        }
    }
    return { duffelAmountCents, chargeAmountCents, currency: ccy };
}
export function formatMoneyFromCents(amountCents, currency) {
    const ccy = (currency || 'usd').toLowerCase();
    const abs = Math.abs(amountCents);
    const dollars = Math.floor(abs / 100);
    const cents = abs % 100;
    const sign = amountCents < 0 ? '-' : '';
    const amount = cents === 0 ? `${dollars}` : `${dollars}.${String(cents).padStart(2, '0')}`;
    if (ccy === 'usd')
        return `${sign}$${amount}`;
    return `${sign}${ccy.toUpperCase()} ${amount}`;
}
