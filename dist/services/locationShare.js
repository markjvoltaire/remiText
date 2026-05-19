import { normalizeContactKey } from '../utils/contactId.js';
import { appendMessage, claimLocationAcknowledgment, getUserByPhone, seedLocationAcknowledgment, } from './supabase.js';
import { chatGuidForContact, listSharedFriendLocations, sendTextMessage } from './imessage.js';
import { nearestAirports } from '../utils/nearestAirport.js';
function buildLocationAckMessage(location) {
    const { latitude, longitude, shortAddress } = location;
    if (latitude !== undefined && longitude !== undefined) {
        const airports = nearestAirports(latitude, longitude, 1);
        const nearest = airports[0];
        if (nearest) {
            const place = shortAddress ? ` (${shortAddress})` : '';
            return `Got it — I have your location now${place}. Looks like you're near ${nearest.iata} (${nearest.city}). Where would you like to fly?`;
        }
    }
    return "Got it — I have your location now. I can suggest flights from your nearest airport whenever you're ready.";
}
export async function handleNewLocationShare(contactKey, location) {
    if (!(await claimLocationAcknowledgment(contactKey)))
        return;
    const text = buildLocationAckMessage(location);
    const chatGuid = chatGuidForContact(contactKey);
    console.log(`[locations] new share contact=${contactKey} type=${location.locationType}`);
    await sendTextMessage(chatGuid, text);
    const user = await getUserByPhone(contactKey);
    if (user) {
        await appendMessage(user.id, 'assistant', text);
    }
}
/** Marks contacts already sharing location so they are not notified on deploy. */
export async function seedExistingLocationSharers() {
    try {
        const locations = await listSharedFriendLocations();
        for (const location of locations) {
            const contactKey = normalizeContactKey(location.address);
            if (contactKey)
                await seedLocationAcknowledgment(contactKey);
        }
        if (locations.length > 0) {
            console.log(`[locations] seeded ${locations.length} existing location share(s)`);
        }
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[locations] seed existing sharers failed: ${msg}`);
    }
}
