import Stripe from 'stripe';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim() ?? '';
const stripe = new Stripe(stripeSecretKey);

export function isStripeConfigurationError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /invalid api key|no api key provided|api key expired/i.test(message);
}

export async function chargeViaSPT(
  sptId: string,
  amountInCents: number,
  currency: string,
  stripeCustomerId?: string | null,
): Promise<string> {
  let customerId = stripeCustomerId?.trim() || undefined;
  if (!customerId) {
    const pm = await stripe.paymentMethods.retrieve(sptId);
    const c = pm.customer;
    if (typeof c === 'string') customerId = c;
    else if (c && typeof c === 'object' && 'id' in c && !('deleted' in c && (c as { deleted?: boolean }).deleted)) {
      customerId = (c as { id: string }).id;
    }
  }
  if (!customerId) {
    throw new Error(
      'Payment method is not linked to a Stripe customer. Re-add your card using the signup link.',
    );
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountInCents,
    currency,
    customer: customerId,
    payment_method: sptId,
    confirm: true,
    off_session: true,
  });

  if (paymentIntent.status !== 'succeeded') {
    throw new Error(`Payment failed with status: ${paymentIntent.status}`);
  }

  return paymentIntent.id;
}

/**
 * Refund a previously-confirmed PaymentIntent. Used to roll back a Stripe
 * charge when a downstream booking step (e.g. Duffel order create) fails
 * after the user has already been charged.
 */
export async function refundPaymentIntent(paymentIntentId: string): Promise<string> {
  const refund = await stripe.refunds.create({ payment_intent: paymentIntentId });
  return refund.id;
}
