import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const TICKET = '#F4F3F0';
const INK = '#050505';
const MUTED = 'rgba(0,0,0,0.6)';
const LINE = 'rgba(0,0,0,0.16)';
const ACCENT = '#E1306C';
const POSH_TEAL = '#0D9488';
function truncate(s, max) {
    const t = s.trim();
    if (t.length <= max)
        return t;
    return `${t.slice(0, max - 1)}…`;
}
export function PoshEventCard(data) {
    const optionLabel = data.optionLabel ?? 'Posh event';
    const title = truncate(data.title, 52);
    const venue = truncate(data.venue, 44);
    const when = truncate(data.when, 40);
    const city = truncate(data.city, 28);
    const link = truncate(data.shortLink, 48);
    return (_jsx("div", { style: {
            width: '100%',
            height: '100%',
            display: 'flex',
            backgroundColor: TICKET,
            color: INK,
            fontFamily: 'Inter',
            position: 'relative',
        }, children: _jsxs("div", { style: {
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                backgroundColor: TICKET,
                padding: '86px 80px 72px',
                overflow: 'hidden',
            }, children: [_jsxs("div", { style: {
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: 18,
                        display: 'flex',
                    }, children: [_jsx("div", { style: { flex: 1, backgroundColor: POSH_TEAL } }), _jsx("div", { style: { flex: 1, backgroundColor: ACCENT } }), _jsx("div", { style: { flex: 1, backgroundColor: '#6366F1' } }), _jsx("div", { style: { flex: 1, backgroundColor: '#F59E0B' } })] }), _jsxs("div", { style: {
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                    }, children: [_jsxs("div", { style: { display: 'flex', flexDirection: 'column', maxWidth: 720 }, children: [_jsx("div", { style: {
                                        display: 'flex',
                                        alignItems: 'center',
                                        alignSelf: 'flex-start',
                                        padding: '12px 22px',
                                        borderRadius: 999,
                                        border: `2px solid ${LINE}`,
                                        color: MUTED,
                                        fontSize: 26,
                                        fontWeight: 700,
                                        letterSpacing: 2,
                                        textTransform: 'uppercase',
                                    }, children: optionLabel }), _jsx("div", { style: {
                                        color: MUTED,
                                        fontSize: 32,
                                        fontWeight: 400,
                                        marginTop: 26,
                                        letterSpacing: 3,
                                    }, children: "POSH EVENT" })] }), _jsx("div", { style: {
                                fontSize: 30,
                                fontWeight: 700,
                                color: POSH_TEAL,
                                letterSpacing: 2,
                            }, children: "posh.vip" })] }), _jsx("div", { style: {
                        marginTop: 56,
                        fontSize: 54,
                        fontWeight: 700,
                        lineHeight: 1.12,
                        letterSpacing: -0.5,
                    }, children: title }), _jsx("div", { style: {
                        marginTop: 36,
                        fontSize: 36,
                        fontWeight: 400,
                        color: MUTED,
                        lineHeight: 1.2,
                    }, children: venue }), _jsx("div", { style: {
                        marginTop: 28,
                        fontSize: 40,
                        fontWeight: 700,
                        lineHeight: 1.2,
                    }, children: when }), _jsx("div", { style: {
                        marginTop: 32,
                        alignSelf: 'flex-start',
                        padding: '10px 24px',
                        borderRadius: 999,
                        border: `2px solid ${LINE}`,
                        fontSize: 28,
                        fontWeight: 600,
                        color: INK,
                    }, children: city }), _jsx("div", { style: { flex: 1 } }), _jsx("div", { style: {
                        paddingTop: 28,
                        borderTop: `2px dashed ${LINE}`,
                        fontSize: 28,
                        fontWeight: 400,
                        color: MUTED,
                    }, children: link })] }) }));
}
