export interface AllInPrice {
  duffelAmountCents: number;
  chargeAmountCents: number;
  currency: string; // lower-case (e.g. "usd")
  /** Customer charge minus Duffel supplier fare (includes round-up cents). */
  markupCents: number;
  pricingMode: 'ota' | 'markup';
  /** Charge before REMI_ROUND_TO_DOLLAR, when rounding changed the total. */
  preRoundChargeCents?: number;
}

function parseAmountToCents(amount: string): number {
  const n = Number.parseFloat(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function getMarkupFlatCents(): number {
  const raw = process.env.REMI_MARKUP_FLAT_CENTS ?? process.env.REMI_BOOKING_FEE_CENTS ?? '0';
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function getMarkupPercent(): number {
  const raw = process.env.REMI_MARKUP_PERCENT ?? '0';
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function roundUpToDollar(cents: number): number {
  if (cents <= 0) return 0;
  return Math.ceil(cents / 100) * 100;
}

/**
 * Pricing strategy:
 * - Default: "ota" = max( ceil(fare*1.04), fare + $3 ) then round up to $1.
 *   This is designed to cover Stripe (2.9% + $0.30) + ~2¢ SMS reliably.
 * - Optional override: "markup" = fare + flat + percent (env-driven).
 */
export function computeAllInPrice(duffelAmount: string, currency: string): AllInPrice {
  const ccy = (currency || 'usd').toLowerCase();
  const duffelAmountCents = parseAmountToCents(duffelAmount);
  const mode = (process.env.REMI_PRICING_MODE ?? 'ota').toLowerCase();

  const pricingMode: AllInPrice['pricingMode'] = mode === 'markup' ? 'markup' : 'ota';
  let chargeAmountCents: number;
  let preRoundChargeCents: number | undefined;

  if (pricingMode === 'markup') {
    const flat = getMarkupFlatCents();
    const pct = getMarkupPercent();
    const pctCents = Math.round(duffelAmountCents * pct);
    chargeAmountCents = duffelAmountCents + flat + pctCents;
  } else {
    const pct = Number.parseFloat(process.env.REMI_OTA_PERCENT ?? '0.04');
    const minAddCents = Number.parseInt(process.env.REMI_OTA_MIN_ADD_CENTS ?? '300', 10);
    const pctSafe = Number.isFinite(pct) ? Math.max(0, pct) : 0.04;
    const minSafe = Number.isFinite(minAddCents) ? Math.max(0, minAddCents) : 300;

    const pctPrice = Math.ceil(duffelAmountCents * (1 + pctSafe));
    const minPrice = duffelAmountCents + minSafe;
    chargeAmountCents = Math.max(pctPrice, minPrice);
    preRoundChargeCents = chargeAmountCents;

    const round = (process.env.REMI_ROUND_TO_DOLLAR ?? 'true').toLowerCase();
    if (round !== 'false' && round !== '0' && round !== 'no') {
      chargeAmountCents = roundUpToDollar(chargeAmountCents);
    }
  }

  return {
    duffelAmountCents,
    chargeAmountCents,
    currency: ccy,
    markupCents: chargeAmountCents - duffelAmountCents,
    pricingMode,
    preRoundChargeCents:
      preRoundChargeCents != null && preRoundChargeCents !== chargeAmountCents
        ? preRoundChargeCents
        : undefined,
  };
}

/** Structured price breakdown for Render/host logs. */
export function logPriceBreakdown(
  context: string,
  allIn: AllInPrice,
  meta?: Record<string, unknown>,
): void {
  const payload: Record<string, unknown> = {
    context,
    pricing_mode: allIn.pricingMode,
    duffel: formatMoneyFromCents(allIn.duffelAmountCents, allIn.currency),
    remi_markup: formatMoneyFromCents(allIn.markupCents, allIn.currency),
    customer_charge: formatMoneyFromCents(allIn.chargeAmountCents, allIn.currency),
    duffel_cents: allIn.duffelAmountCents,
    markup_cents: allIn.markupCents,
    charge_cents: allIn.chargeAmountCents,
    currency: allIn.currency,
    ...meta,
  };

  if (allIn.preRoundChargeCents != null) {
    payload.pre_round_charge = formatMoneyFromCents(allIn.preRoundChargeCents, allIn.currency);
    payload.round_up_cents = allIn.chargeAmountCents - allIn.preRoundChargeCents;
  }

  console.log('[pricing]', JSON.stringify(payload));
}

export function formatMoneyFromCents(amountCents: number, currency: string): string {
  const ccy = (currency || 'usd').toLowerCase();
  const abs = Math.abs(amountCents);
  const dollars = Math.floor(abs / 100);
  const cents = abs % 100;
  const sign = amountCents < 0 ? '-' : '';

  const amount =
    cents === 0 ? `${dollars}` : `${dollars}.${String(cents).padStart(2, '0')}`;

  if (ccy === 'usd') return `${sign}$${amount}`;
  return `${sign}${ccy.toUpperCase()} ${amount}`;
}

