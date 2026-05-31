function readString(obj, key) {
    const v = obj[key];
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}
function formatEventDate(event) {
    const dates = event.dates;
    const start = dates?.start;
    if (!start)
        return 'date TBA';
    const localDate = readString(start, 'localDate');
    const localTime = readString(start, 'localTime');
    const dateTime = readString(start, 'dateTime');
    if (localDate && localTime) {
        const [y, m, d] = localDate.split('-');
        const [hh, mm] = localTime.split(':');
        if (y && m && d && hh) {
            const month = new Date(Number(y), Number(m) - 1, Number(d)).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
            });
            const hour = Number(hh) % 12 || 12;
            const ampm = Number(hh) >= 12 ? 'pm' : 'am';
            const min = mm && mm !== '00' ? `:${mm}` : '';
            return `${month} · ${hour}${min}${ampm}`;
        }
    }
    if (localDate)
        return localDate;
    if (dateTime) {
        const d = new Date(dateTime);
        if (!Number.isNaN(d.getTime())) {
            return d.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
            });
        }
    }
    return 'date TBA';
}
function formatPriceRange(event) {
    const ranges = event.priceRanges;
    if (!Array.isArray(ranges) || ranges.length === 0)
        return undefined;
    const min = ranges[0]?.min;
    const max = ranges[0]?.max;
    const currency = (readString(ranges[0] ?? {}, 'currency') ?? 'USD').toUpperCase();
    const sym = currency === 'USD' ? '$' : `${currency} `;
    if (typeof min === 'number' && typeof max === 'number' && min !== max) {
        return `from ${sym}${Math.round(min)}`;
    }
    if (typeof min === 'number')
        return `from ${sym}${Math.round(min)}`;
    if (typeof max === 'number')
        return `up to ${sym}${Math.round(max)}`;
    return undefined;
}
function venueLine(event) {
    const embedded = event._embedded;
    const venues = embedded?.venues;
    const v = venues?.[0];
    if (!v)
        return { venue: 'Venue TBA' };
    const name = readString(v, 'name') ?? 'Venue TBA';
    const cityObj = v.city;
    const city = readString(cityObj ?? {}, 'name');
    return { venue: name, city };
}
export function parseTicketmasterEventsPayload(payload) {
    const root = payload;
    const embedded = root?._embedded;
    const events = embedded?.events;
    if (!Array.isArray(events))
        return [];
    const summaries = [];
    for (const event of events) {
        const id = readString(event, 'id');
        const name = readString(event, 'name');
        if (!id || !name)
            continue;
        const { venue, city } = venueLine(event);
        const url = readString(event, 'url');
        summaries.push({
            id,
            name,
            dateLabel: formatEventDate(event),
            venue,
            city,
            priceLabel: formatPriceRange(event),
            url,
        });
    }
    return summaries;
}
export function eventsToSMS(events) {
    if (events.length === 0) {
        return "i couldn't find any shows matching that. want to try different dates or a nearby city?";
    }
    const lines = events.map((e, i) => {
        const where = e.city ? `${e.venue}, ${e.city}` : e.venue;
        const price = e.priceLabel ? ` · ${e.priceLabel}` : '';
        return `${i + 1}. ${e.name}\n${e.dateLabel} · ${where}${price}`;
    });
    return `${lines.join('\n\n')}\n\nwhich one?`;
}
export function eventDetailToSMS(event) {
    const name = readString(event, 'name') ?? 'Event';
    const dateLabel = formatEventDate(event);
    const { venue, city } = venueLine(event);
    const where = city ? `${venue}, ${city}` : venue;
    const price = formatPriceRange(event);
    const url = readString(event, 'url');
    const parts = [`${name}`, `${dateLabel} · ${where}`];
    if (price)
        parts.push(price);
    if (url)
        parts.push(url);
    return parts.join('\n');
}
