import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Remi preview card — warm editorial, ambient concierge (not boarding-pass chrome). */
const CANVAS = "#F7F6F3";
const SURFACE = "#FFFFFF";
const INK = "#1A1A1A";
const MUTED = "#787774";
const LINE = "#E8E6E1";
const WHISPER = "rgba(26, 26, 26, 0.06)";
function stopsLabel(stops) {
    if (stops == null || stops <= 0)
        return "nonstop";
    if (stops === 1)
        return "1 stop";
    return `${stops} stops`;
}
function airlineInitials(airline) {
    const initials = airline
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part.charAt(0))
        .join("")
        .slice(0, 2)
        .toUpperCase();
    return initials || "?";
}
function compactTimeLabel(raw) {
    const s = raw.trim();
    const m12 = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (m12) {
        const h = parseInt(m12[1], 10);
        const min = m12[2];
        const suffix = m12[3].toLowerCase() === "am" ? "a" : "p";
        const h12 = h % 12 || 12;
        return `${h12}:${min}${suffix}`;
    }
    return s;
}
function formatOptionLabel(label) {
    if (!label?.trim())
        return "flight";
    return label.trim().toLowerCase();
}
function RouteArrow() {
    return (_jsx("svg", { width: 48, height: 24, viewBox: "0 0 48 24", style: { display: "block" }, children: _jsx("path", { d: "M4 12h32M30 6l8 6-8 6", stroke: MUTED, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" }) }));
}
export function FlightCard(data) {
    const stops = stopsLabel(data.stops);
    const date = data.date ?? "";
    const optionLabel = formatOptionLabel(data.optionLabel);
    const dep = compactTimeLabel(data.departureTime);
    const arr = compactTimeLabel(data.arrivalTime);
    const meta = [data.duration, stops].filter(Boolean).join(" · ");
    const flightMeta = data.flightNumber
        ? `${data.airline} · ${data.flightNumber}`
        : data.airline;
    return (_jsx("div", { style: {
            width: "100%",
            height: "100%",
            display: "flex",
            backgroundColor: CANVAS,
            color: INK,
            fontFamily: "Inter",
            padding: 48,
        }, children: _jsxs("div", { style: {
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                backgroundColor: SURFACE,
                border: `1px solid ${LINE}`,
                borderRadius: 16,
                padding: "56px 64px 52px",
                position: "relative",
                overflow: "hidden",
            }, children: [_jsx("div", { style: {
                        position: "absolute",
                        top: 0,
                        left: 48,
                        right: 48,
                        height: 3,
                        backgroundColor: INK,
                        opacity: 0.08,
                        borderRadius: 2,
                    } }), _jsxs("div", { style: {
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                    }, children: [_jsx("div", { style: {
                                fontSize: 28,
                                fontWeight: 700,
                                letterSpacing: -0.5,
                                color: INK,
                                display: "flex",
                            }, children: "remi" }), _jsx("div", { style: {
                                fontSize: 22,
                                fontWeight: 400,
                                color: MUTED,
                                letterSpacing: 0.3,
                                display: "flex",
                            }, children: optionLabel })] }), _jsxs("div", { style: {
                        marginTop: 72,
                        display: "flex",
                        flexDirection: "column",
                    }, children: [_jsxs("div", { style: {
                                display: "flex",
                                alignItems: "baseline",
                                gap: 20,
                            }, children: [_jsx("div", { style: {
                                        fontSize: 52,
                                        fontWeight: 700,
                                        letterSpacing: -1.5,
                                        lineHeight: 1.05,
                                        color: INK,
                                        display: "flex",
                                    }, children: data.origin }), _jsx("div", { style: {
                                        fontSize: 26,
                                        fontWeight: 400,
                                        color: MUTED,
                                        paddingBottom: 6,
                                        display: "flex",
                                    }, children: "to" }), _jsx("div", { style: {
                                        fontSize: 52,
                                        fontWeight: 700,
                                        letterSpacing: -1.5,
                                        lineHeight: 1.05,
                                        color: INK,
                                        display: "flex",
                                    }, children: data.destination })] }), date ? (_jsx("div", { style: {
                                fontSize: 28,
                                fontWeight: 400,
                                color: MUTED,
                                marginTop: 16,
                                display: "flex",
                            }, children: date })) : null] }), _jsxs("div", { style: {
                        marginTop: 88,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-end",
                    }, children: [_jsxs("div", { style: { display: "flex", flexDirection: "column", width: 300 }, children: [_jsx("div", { style: {
                                        fontSize: 72,
                                        fontWeight: 700,
                                        letterSpacing: -2,
                                        lineHeight: 1,
                                        display: "flex",
                                    }, children: dep }), _jsx("div", { style: {
                                        fontSize: 32,
                                        fontWeight: 400,
                                        color: MUTED,
                                        marginTop: 12,
                                        display: "flex",
                                    }, children: data.origin })] }), _jsxs("div", { style: {
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                paddingBottom: 8,
                            }, children: [_jsx(RouteArrow, {}), meta ? (_jsx("div", { style: {
                                        fontSize: 24,
                                        fontWeight: 400,
                                        color: MUTED,
                                        marginTop: 14,
                                        textAlign: "center",
                                        display: "flex",
                                    }, children: meta })) : null] }), _jsxs("div", { style: {
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "flex-end",
                                width: 300,
                            }, children: [_jsx("div", { style: {
                                        fontSize: 72,
                                        fontWeight: 700,
                                        letterSpacing: -2,
                                        lineHeight: 1,
                                        display: "flex",
                                    }, children: arr }), _jsx("div", { style: {
                                        fontSize: 32,
                                        fontWeight: 400,
                                        color: MUTED,
                                        marginTop: 12,
                                        display: "flex",
                                    }, children: data.destination })] })] }), _jsx("div", { style: {
                        height: 1,
                        backgroundColor: LINE,
                        marginTop: 96,
                    } }), _jsxs("div", { style: {
                        marginTop: 40,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                    }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 20 }, children: [data.logoUrl ? (_jsx("img", { src: data.logoUrl, width: 120, height: 40, style: { objectFit: "contain", display: "flex" } })) : (_jsx("div", { style: {
                                        width: 52,
                                        height: 52,
                                        borderRadius: 8,
                                        backgroundColor: WHISPER,
                                        color: INK,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        fontSize: 20,
                                        fontWeight: 700,
                                    }, children: airlineInitials(data.airline) })), _jsx("div", { style: {
                                        fontSize: 26,
                                        fontWeight: 400,
                                        color: MUTED,
                                        maxWidth: 420,
                                        display: "flex",
                                    }, children: flightMeta })] }), _jsx("div", { style: {
                                fontSize: 64,
                                fontWeight: 700,
                                letterSpacing: -1.5,
                                lineHeight: 1,
                                color: INK,
                                display: "flex",
                            }, children: data.price })] })] }) }));
}
