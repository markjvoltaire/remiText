import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const BG = '#0B0F19';
const SURFACE = '#111726';
const BORDER = '#1F2937';
const TEXT = '#F9FAFB';
const MUTED = '#9CA3AF';
const ACCENT = '#34D399';
function stopsLabel(stops) {
    if (stops == null)
        return 'Nonstop';
    if (stops <= 0)
        return 'Nonstop';
    if (stops === 1)
        return '1 stop';
    return `${stops} stops`;
}
function Arrow({ size = 56, color = TEXT }) {
    const stroke = Math.max(3, Math.round(size / 14));
    return (_jsx("svg", { width: size, height: size / 2, viewBox: "0 0 56 28", xmlns: "http://www.w3.org/2000/svg", style: { display: 'block' }, children: _jsx("path", { d: "M2 14 L48 14 M36 4 L50 14 L36 24", stroke: color, strokeWidth: stroke, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" }) }));
}
export function FlightCard(data) {
    const stops = stopsLabel(data.stops);
    return (_jsxs("div", { style: {
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: BG,
            color: TEXT,
            fontFamily: 'Inter',
            padding: '80px 72px',
            justifyContent: 'space-between',
        }, children: [_jsxs("div", { style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                }, children: [_jsxs("div", { style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: 20,
                        }, children: [data.logoUrl ? (_jsx("img", { src: data.logoUrl, width: 72, height: 72, style: { borderRadius: 16, objectFit: 'contain' } })) : (_jsx("div", { style: {
                                    width: 72,
                                    height: 72,
                                    borderRadius: 16,
                                    backgroundColor: SURFACE,
                                    border: `1px solid ${BORDER}`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 36,
                                    fontWeight: 700,
                                    color: ACCENT,
                                }, children: data.airline.charAt(0).toUpperCase() })), _jsx("div", { style: {
                                    fontSize: 44,
                                    fontWeight: 700,
                                    letterSpacing: -0.5,
                                }, children: data.airline })] }), _jsxs("div", { style: {
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-end',
                        }, children: [_jsx("div", { style: { color: MUTED, fontSize: 26, fontWeight: 400 }, children: "Total" }), _jsx("div", { style: {
                                    color: ACCENT,
                                    fontSize: 72,
                                    fontWeight: 700,
                                    lineHeight: 1,
                                    marginTop: 8,
                                }, children: data.price })] })] }), _jsxs("div", { style: {
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 48,
                }, children: [_jsxs("div", { style: {
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 36,
                        }, children: [_jsx("div", { style: { fontSize: 200, fontWeight: 700, lineHeight: 1, letterSpacing: -6 }, children: data.origin }), _jsx(Arrow, { size: 96 }), _jsx("div", { style: { fontSize: 200, fontWeight: 700, lineHeight: 1, letterSpacing: -6 }, children: data.destination })] }), _jsxs("div", { style: {
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 10,
                        }, children: [_jsx("div", { style: { fontSize: 36, fontWeight: 700, color: TEXT, letterSpacing: -0.5 }, children: data.duration }), _jsx("div", { style: { fontSize: 28, color: MUTED }, children: stops })] }), _jsxs("div", { style: {
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 24,
                            marginTop: 8,
                        }, children: [_jsxs("div", { style: {
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    minWidth: 220,
                                }, children: [_jsx("div", { style: { fontSize: 22, color: MUTED, letterSpacing: 2 }, children: "DEPART" }), _jsx("div", { style: { fontSize: 40, fontWeight: 700, marginTop: 6 }, children: data.departureTime })] }), _jsx("div", { style: {
                                    width: 1,
                                    height: 60,
                                    backgroundColor: BORDER,
                                } }), _jsxs("div", { style: {
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    minWidth: 220,
                                }, children: [_jsx("div", { style: { fontSize: 22, color: MUTED, letterSpacing: 2 }, children: "ARRIVE" }), _jsx("div", { style: { fontSize: 40, fontWeight: 700, marginTop: 6 }, children: data.arrivalTime })] })] })] }), _jsxs("div", { style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingTop: 32,
                    borderTop: `1px solid ${BORDER}`,
                }, children: [_jsxs("div", { style: {
                            color: MUTED,
                            fontSize: 26,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 14,
                        }, children: [_jsx("span", { children: data.origin }), _jsx(Arrow, { size: 36, color: MUTED }), _jsx("span", { children: data.destination })] }), _jsx("div", { style: {
                            color: TEXT,
                            fontSize: 26,
                            fontWeight: 700,
                            letterSpacing: 3,
                            display: 'flex',
                        }, children: "REMI" })] })] }));
}
