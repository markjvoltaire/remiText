export function venueNameMatches(a, b) {
    const na = a.trim().toLowerCase();
    const nb = b.trim().toLowerCase();
    if (!na || !nb)
        return false;
    return na.includes(nb) || nb.includes(na);
}
function bookingLabel(b) {
    const date = b.reservation_date ?? b.date ?? '';
    const time = b.reservation_time ?? b.time ?? '';
    return `${b.venue_name} on ${date} at ${time} for ${b.party_size}`;
}
export function resolveReservationToCancel(params) {
    if (params.resyToken?.trim()) {
        const token = params.resyToken.trim();
        const db = params.dbBookings.find((b) => b.resy_token === token);
        if (db) {
            return {
                kind: 'single',
                resy_token: token,
                label: bookingLabel(db),
                venue_name: db.venue_name,
                date: db.reservation_date,
                time: db.reservation_time,
            };
        }
        const resy = params.resyUpcoming.find((r) => r.resy_token === token);
        if (resy) {
            return {
                kind: 'single',
                resy_token: token,
                label: bookingLabel(resy),
                venue_name: resy.venue_name,
                date: resy.date,
                time: resy.time,
            };
        }
        return {
            kind: 'none',
            message: 'I could not find that reservation. Call list_restaurant_reservations to see what is booked.',
        };
    }
    const venueQuery = params.venueName?.trim();
    const dateQuery = params.date?.trim();
    const dbMatches = params.dbBookings.filter((b) => {
        if (venueQuery && !venueNameMatches(b.venue_name, venueQuery))
            return false;
        if (dateQuery && b.reservation_date !== dateQuery)
            return false;
        return true;
    });
    const resyMatches = params.resyUpcoming.filter((r) => {
        if (venueQuery && !venueNameMatches(r.venue_name, venueQuery))
            return false;
        if (dateQuery && r.date !== dateQuery)
            return false;
        return true;
    });
    const byToken = new Map();
    for (const b of dbMatches) {
        byToken.set(b.resy_token, {
            resy_token: b.resy_token,
            label: bookingLabel(b),
            venue_name: b.venue_name,
            date: b.reservation_date,
            time: b.reservation_time,
            party_size: b.party_size,
        });
    }
    for (const r of resyMatches) {
        if (!byToken.has(r.resy_token)) {
            byToken.set(r.resy_token, {
                resy_token: r.resy_token,
                label: bookingLabel(r),
                venue_name: r.venue_name,
                date: r.date,
                time: r.time,
                party_size: r.party_size,
            });
        }
    }
    const options = [...byToken.values()];
    if (options.length === 1) {
        const o = options[0];
        return {
            kind: 'single',
            resy_token: o.resy_token,
            label: o.label,
            venue_name: o.venue_name,
            date: o.date,
            time: o.time,
        };
    }
    if (options.length > 1) {
        return {
            kind: 'ambiguous',
            options: options.map((o, i) => ({ index: i + 1, ...o })),
        };
    }
    if (venueQuery) {
        return {
            kind: 'none',
            message: `No upcoming reservation found for "${venueQuery}"${dateQuery ? ` on ${dateQuery}` : ''}.`,
        };
    }
    return {
        kind: 'none',
        message: 'Tell me which reservation to cancel (restaurant name or "cancel my 7pm at Bondi"). Or call list_restaurant_reservations first.',
    };
}
