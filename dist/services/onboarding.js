import { createClient } from '@supabase/supabase-js';
import { normalizeContactKey } from '../utils/contactId.js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const GREETING_TOKENS = new Set([
    'hi',
    'hey',
    'hello',
    'hiya',
    'yo',
    'sup',
    'howdy',
    'heya',
    'hola',
    'thanks',
    'thank',
    'you',
    'ok',
    'okay',
    'yes',
    'no',
    'test',
]);
function normalizeName(raw) {
    const name = raw.replace(/\s+/g, ' ').trim();
    if (name.length < 2)
        return null;
    if (GREETING_TOKENS.has(name.toLowerCase()))
        return null;
    return name;
}
function normalizeCity(raw) {
    const city = raw.replace(/\s+/g, ' ').trim();
    if (city.length < 2)
        return null;
    if (GREETING_TOKENS.has(city.toLowerCase()))
        return null;
    return city;
}
function placeholderEmail(phone) {
    const digits = phone.replace(/\D/g, '') || 'user';
    return `text+${digits}@remi.local`;
}
export async function getOnboardingSession(phone) {
    const { data, error } = await supabase
        .from('onboarding_sessions')
        .select('phone, step, name, city')
        .eq('phone', phone)
        .maybeSingle();
    if (error || !data)
        return null;
    const step = data.step === 'city' ? 'city' : 'name';
    return {
        phone: data.phone,
        step,
        name: data.name ?? null,
        city: data.city ?? null,
    };
}
export async function startOnboarding(phone) {
    const { data, error } = await supabase
        .from('onboarding_sessions')
        .upsert({ phone, step: 'name', name: null, city: null }, { onConflict: 'phone' })
        .select('phone, step, name, city')
        .single();
    if (error)
        throw error;
    return {
        phone: data.phone,
        step: data.step === 'city' ? 'city' : 'name',
        name: data.name ?? null,
        city: data.city ?? null,
    };
}
export async function advanceOnboarding(session, inboundText) {
    const text = inboundText.trim();
    if (session.step === 'name') {
        const name = normalizeName(text);
        if (!name) {
            return {
                kind: 'prompt',
                message: "What's your name?",
            };
        }
        await supabase.from('onboarding_sessions').update({ name, step: 'city' }).eq('phone', session.phone);
        return { kind: 'prompt', message: 'What city are you in?' };
    }
    const city = normalizeCity(text);
    if (!city) {
        return { kind: 'prompt', message: 'What city are you in? (e.g. New York, Miami)' };
    }
    const latest = await getOnboardingSession(session.phone);
    if (!latest?.name) {
        return { kind: 'prompt', message: "What's your name?" };
    }
    await supabase.from('onboarding_sessions').update({ city }).eq('phone', session.phone);
    const canonicalPhone = normalizeContactKey(latest.phone);
    const profile = {
        phone: canonicalPhone,
        name: latest.name,
        city,
        email: placeholderEmail(canonicalPhone),
        date_of_birth: '1990-01-01',
        gender: 'm',
        passport_number: null,
        stripe_customer_id: null,
        stripe_spt_id: null,
    };
    const { data: inserted, error: insertError } = await supabase
        .from('users')
        .insert(profile)
        .select('*')
        .single();
    if (insertError) {
        const { data: existing } = await supabase
            .from('users')
            .select('*')
            .eq('phone', canonicalPhone)
            .maybeSingle();
        if (!existing)
            throw insertError;
        await supabase.from('onboarding_sessions').delete().eq('phone', latest.phone);
        return { kind: 'completed', user: existing };
    }
    await supabase.from('onboarding_sessions').delete().eq('phone', latest.phone);
    return { kind: 'completed', user: inserted };
}
