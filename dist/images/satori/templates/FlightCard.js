import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const PAGE_BG = '#F0F2F5';
const CARD_BG = '#FFFFFF';
const PRIMARY = '#333333';
const MUTED = '#757575';
const DIVIDER = '#E0E0E0';
const LOGO_RING = '#FFCC00';
const LOGO_FALLBACK_TEXT = '#05164D';
const DISCOUNT_BG = '#E8F5E9';
const DISCOUNT_TEXT = '#2E7D32';
function airportLine(iata, city) {
    const c = city?.trim();
    if (c)
        return `${iata} (${c})`;
    return iata;
}
function ClockIcon({ size = 22, color = MUTED }) {
    return (_jsxs("svg", { width: size, height: size, viewBox: "0 0 24 24", style: { display: 'block', flexShrink: 0 }, children: [_jsx("circle", { cx: "12", cy: "12", r: "9", stroke: color, strokeWidth: "2", fill: "none" }), _jsx("path", { d: "M12 7v5l3 2", stroke: color, strokeWidth: "2", strokeLinecap: "round", fill: "none" })] }));
}
function CalendarIcon({ size = 22, color = MUTED }) {
    return (_jsxs("svg", { width: size, height: size, viewBox: "0 0 24 24", style: { display: 'block', flexShrink: 0 }, children: [_jsx("rect", { x: "3", y: "5", width: "18", height: "16", rx: "2", stroke: color, strokeWidth: "2", fill: "none" }), _jsx("path", { d: "M3 10h18M8 3v4M16 3v4", stroke: color, strokeWidth: "2", strokeLinecap: "round" })] }));
}
function PlaneIcon({ size = 36, color = PRIMARY }) {
    return (_jsx("svg", { width: size, height: size, viewBox: "0 0 24 24", style: { display: 'block' }, children: _jsx("path", { fill: color, d: "M21 12.5l-7-4V6.5c0-.55-.45-1-1-1s-1 .45-1 1V8.5l-7 4v2l7-2v4.5l-2 1.5V20l3.5-1 3.5 1v-1.5L12 17v-4.5l7 2v-2z" }) }));
}
/** Small circle with upward arrow (departure) */
function DepartDotIcon({ size = 26, color = MUTED }) {
    const stroke = 1.8;
    return (_jsxs("svg", { width: size, height: size, viewBox: "0 0 24 24", style: { display: 'block', flexShrink: 0 }, children: [_jsx("circle", { cx: "12", cy: "12", r: "10", stroke: color, strokeWidth: stroke, fill: "none" }), _jsx("path", { d: "M12 17V10M9 13l3-3 3 3", stroke: color, strokeWidth: stroke, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" })] }));
}
/** Small circle with downward arrow (arrival) */
function ArriveDotIcon({ size = 26, color = MUTED }) {
    const stroke = 1.8;
    return (_jsxs("svg", { width: size, height: size, viewBox: "0 0 24 24", style: { display: 'block', flexShrink: 0 }, children: [_jsx("circle", { cx: "12", cy: "12", r: "10", stroke: color, strokeWidth: stroke, fill: "none" }), _jsx("path", { d: "M12 7v7M9 11l3 3 3-3", stroke: color, strokeWidth: stroke, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" })] }));
}
export function FlightCard(data) {
    const originLine = airportLine(data.origin, data.originCity);
    const destLine = airportLine(data.destination, data.destinationCity);
    const initial = data.airline.charAt(0).toUpperCase();
    const showDiscount = data.discountPercent != null && data.discountPercent > 0 && data.discountPercent <= 100;
    return (_jsx("div", { style: {
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: PAGE_BG,
            fontFamily: 'Inter',
            padding: 72,
        }, children: _jsxs("div", { style: {
                width: '100%',
                maxWidth: 936,
                backgroundColor: CARD_BG,
                borderRadius: 36,
                padding: '56px 52px 48px',
                boxShadow: '0 10px 44px rgba(15, 23, 42, 0.08)',
                border: '1px solid rgba(0,0,0,0.04)',
                display: 'flex',
                flexDirection: 'column',
                color: PRIMARY,
            }, children: [_jsxs("div", { style: {
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                    }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 28 }, children: [_jsx("div", { style: {
                                        width: 88,
                                        height: 88,
                                        borderRadius: '50%',
                                        backgroundColor: LOGO_RING,
                                        overflow: 'hidden',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0,
                                    }, children: data.logoUrl ? (_jsx("img", { src: data.logoUrl, width: 72, height: 72, style: { objectFit: 'contain' } })) : (_jsx("span", { style: {
                                            fontSize: 38,
                                            fontWeight: 700,
                                            color: LOGO_FALLBACK_TEXT,
                                        }, children: initial })) }), _jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 6 }, children: [_jsx("div", { style: {
                                                display: 'flex',
                                                fontSize: 34,
                                                fontWeight: 700,
                                                letterSpacing: -0.4,
                                                lineHeight: 1.2,
                                            }, children: data.airline }), data.aircraft ? (_jsx("div", { style: {
                                                display: 'flex',
                                                fontSize: 24,
                                                fontWeight: 400,
                                                color: MUTED,
                                                lineHeight: 1.3,
                                            }, children: data.aircraft })) : null] })] }), _jsxs("div", { style: {
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                marginTop: 4,
                                color: MUTED,
                                fontSize: 24,
                                fontWeight: 400,
                            }, children: [_jsx(ClockIcon, { size: 24 }), _jsx("span", { children: data.duration })] })] }), _jsxs("div", { style: {
                        display: 'flex',
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: 56,
                        marginBottom: 8,
                        paddingLeft: 8,
                        paddingRight: 8,
                    }, children: [_jsxs("div", { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flex: 1 }, children: [_jsx("div", { style: {
                                        display: 'flex',
                                        fontSize: 76,
                                        fontWeight: 700,
                                        letterSpacing: -2,
                                        lineHeight: 1,
                                    }, children: data.departureTime }), _jsxs("div", { style: {
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 12,
                                        marginTop: 16,
                                        fontSize: 26,
                                        fontWeight: 400,
                                        color: PRIMARY,
                                    }, children: [_jsx(DepartDotIcon, {}), _jsx("span", { children: originLine })] })] }), _jsx("div", { style: {
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                paddingLeft: 24,
                                paddingRight: 24,
                                flexShrink: 0,
                            }, children: _jsx(PlaneIcon, { size: 44 }) }), _jsxs("div", { style: {
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'flex-end',
                                flex: 1,
                            }, children: [_jsx("div", { style: {
                                        display: 'flex',
                                        fontSize: 76,
                                        fontWeight: 700,
                                        letterSpacing: -2,
                                        lineHeight: 1,
                                    }, children: data.arrivalTime }), _jsxs("div", { style: {
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 12,
                                        marginTop: 16,
                                        fontSize: 26,
                                        fontWeight: 400,
                                        color: PRIMARY,
                                    }, children: [_jsx(ArriveDotIcon, {}), _jsx("span", { children: destLine })] })] })] }), _jsx("div", { style: {
                        display: 'block',
                        marginTop: 44,
                        marginBottom: 36,
                        borderTopWidth: 2,
                        borderTopStyle: 'dashed',
                        borderTopColor: DIVIDER,
                    } }), _jsxs("div", { style: {
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }, children: [_jsxs("div", { style: {
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                color: MUTED,
                                fontSize: 24,
                                fontWeight: 400,
                            }, children: [_jsx(CalendarIcon, { size: 24 }), _jsx("span", { children: data.tripSummary })] }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 16 }, children: [showDiscount ? (_jsxs("div", { style: {
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        backgroundColor: DISCOUNT_BG,
                                        color: DISCOUNT_TEXT,
                                        fontSize: 22,
                                        fontWeight: 700,
                                        padding: '8px 18px',
                                        borderRadius: 999,
                                    }, children: ["-", data.discountPercent, "%"] })) : null, _jsx("div", { style: {
                                        display: 'flex',
                                        fontSize: 44,
                                        fontWeight: 700,
                                        color: PRIMARY,
                                        letterSpacing: -0.5,
                                    }, children: data.price })] })] })] }) }));
}
