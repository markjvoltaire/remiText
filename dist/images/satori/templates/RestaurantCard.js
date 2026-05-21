import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const TICKET = '#F4F3F0';
const INK = '#050505';
const MUTED = 'rgba(0,0,0,0.6)';
const ACCENT = '#E1306C';
const IG_PURPLE = '#833AB4';
function initials(name) {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w.charAt(0))
        .join('')
        .slice(0, 2)
        .toUpperCase();
}
export function RestaurantCard(data) {
    const optionLabel = data.optionLabel ?? 'Remi pick';
    const times = data.times.filter(Boolean).slice(0, 3).join(' · ') || 'Check times in chat';
    const meta = [data.cuisine, data.neighborhood, data.priceRange].filter(Boolean).join(' · ');
    return (_jsxs("div", { style: {
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: TICKET,
            color: INK,
            fontFamily: 'Inter',
        }, children: [_jsx("div", { style: {
                    height: 620,
                    width: '100%',
                    display: 'flex',
                    backgroundColor: '#1a1a1a',
                }, children: data.imageUrl ? (_jsx("img", { src: data.imageUrl, alt: "", style: {
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                    } })) : (_jsx("div", { style: {
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: IG_PURPLE,
                    }, children: _jsx("div", { style: {
                            fontSize: 72,
                            fontWeight: 700,
                            color: '#fff',
                            display: 'flex',
                        }, children: initials(data.name) }) })) }), _jsxs("div", { style: {
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '48px 72px 64px',
                }, children: [_jsx("div", { style: {
                            fontSize: 24,
                            fontWeight: 700,
                            letterSpacing: 1.2,
                            textTransform: 'uppercase',
                            color: ACCENT,
                            display: 'flex',
                        }, children: optionLabel }), _jsx("div", { style: {
                            fontSize: 52,
                            fontWeight: 700,
                            lineHeight: 1.15,
                            marginTop: 16,
                            display: 'flex',
                        }, children: data.name }), meta ? (_jsx("div", { style: { fontSize: 28, color: MUTED, marginTop: 12, display: 'flex' }, children: meta })) : null, data.rating ? (_jsx("div", { style: { fontSize: 26, color: MUTED, marginTop: 8, display: 'flex' }, children: data.rating })) : null, _jsxs("div", { style: {
                            marginTop: 'auto',
                            paddingTop: 32,
                            borderTop: '2px solid rgba(0,0,0,0.1)',
                            display: 'flex',
                            flexDirection: 'column',
                        }, children: [_jsx("div", { style: {
                                    fontSize: 24,
                                    color: MUTED,
                                    textTransform: 'uppercase',
                                    letterSpacing: 1,
                                    display: 'flex',
                                }, children: "Open times" }), _jsx("div", { style: { fontSize: 34, fontWeight: 700, marginTop: 10, display: 'flex' }, children: times }), _jsxs("div", { style: { fontSize: 26, color: MUTED, marginTop: 12, display: 'flex' }, children: [data.date, " \u00B7 party of ", data.partySize] })] })] })] }));
}
