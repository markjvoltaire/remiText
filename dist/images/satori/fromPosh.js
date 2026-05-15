function formatWhen(iso) {
    if (!iso)
        return 'TBA';
    return new Date(iso).toLocaleString('en-US', {
        timeZone: 'America/New_York',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}
export function poshEventCardInputFromRow(row, index) {
    const e = row.event;
    const venue = e.venue?.name?.trim() || row.marketLabel;
    return {
        title: e.name,
        venue,
        when: formatWhen(e.startUtc),
        city: row.marketLabel,
        shortLink: `${e.groupUrl}/${e.url}`,
        optionLabel: `Event ${index + 1}`,
    };
}
