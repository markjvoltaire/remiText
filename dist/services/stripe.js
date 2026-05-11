import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
export async function chargeViaSPT(sptId, amountInCents, currency, stripeCustomerId) {
    let customerId = stripeCustomerId?.trim() || undefined;
    if (!customerId) {
        const pm = await stripe.paymentMethods.retrieve(sptId);
        const c = pm.customer;
        if (typeof c === 'string')
            customerId = c;
        else if (c && typeof c === 'object' && 'id' in c && !('deleted' in c && c.deleted)) {
            customerId = c.id;
        }
    }
    if (!customerId) {
        throw new Error('Payment method is not linked to a Stripe customer. Re-add your card using the signup link.');
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
export async function refundPaymentIntent(paymentIntentId) {
    const refund = await stripe.refunds.create({ payment_intent: paymentIntentId });
    return refund.id;
}
