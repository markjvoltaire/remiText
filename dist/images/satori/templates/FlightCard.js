import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const BG = "#F2F2F7";
const CARD = "#FFFFFF";
const INK = "#111111";
const LABEL = "#9CA3AF";
const PURPLE = "#7C5CFF";
const LINE = "#D1D5DB";
const NOTCH = "#F2F2F7";
const AIRPORT_CITIES = {
    ATL: "Atlanta",
    BOS: "Boston",
    CLT: "Charlotte",
    DFW: "Dallas",
    DEN: "Denver",
    EWR: "Newark",
    FLL: "Fort Lauderdale",
    IAD: "Washington",
    JFK: "New York",
    LAS: "Las Vegas",
    LAX: "Los Angeles",
    LHR: "London",
    MCO: "Orlando",
    MIA: "Miami",
    ORD: "Chicago",
    PHX: "Phoenix",
    SEA: "Seattle",
    SFO: "San Francisco",
};
function cityName(iata, override) {
    if (override?.trim())
        return override.trim();
    return AIRPORT_CITIES[iata.toUpperCase()] ?? "";
}
function formatOptionLabel(label) {
    if (!label?.trim())
        return "option 1";
    return label.trim().toLowerCase();
}
function formatBoardingTime(raw) {
    const s = raw.trim();
    const m12 = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (m12) {
        const h = parseInt(m12[1], 10);
        const min = m12[2];
        const suffix = m12[3].toLowerCase();
        const h12 = h % 12 || 12;
        return `${h12}:${min} ${suffix}`;
    }
    return s;
}
function formatCardDate(raw) {
    if (!raw?.trim())
        return "";
    const withoutOrdinal = raw.replace(/(\d+)(st|nd|rd|th)\b/i, "$1");
    return withoutOrdinal;
}
function formatCabin(raw) {
    if (!raw?.trim())
        return "Economy";
    const s = raw.trim();
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
function zoneLabel(data) {
    if (data.terminal?.trim())
        return data.terminal.trim();
    if (data.gate?.trim())
        return data.gate.trim();
    return "--";
}
function barcodeSeed(data) {
    return [data.flightNumber, data.origin, data.destination, data.date].filter(Boolean).join("|");
}
function MapPattern() {
    const dots = [];
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 14; col++) {
            if ((row + col) % 3 === 0) {
                dots.push(_jsx("circle", { cx: 40 + col * 72, cy: 24 + row * 44, r: 2, fill: "#E5E7EB" }, `${row}-${col}`));
            }
        }
    }
    return (_jsxs("svg", { width: "100%", height: 280, viewBox: "0 0 984 280", style: { position: "absolute", top: 0, left: 0, display: "flex" }, children: [dots, _jsx("path", { d: "M120 200 Q492 80 864 200", stroke: "#E5E7EB", strokeWidth: 1.5, fill: "none" })] }));
}
function RouteArc() {
    return (_jsxs("svg", { width: 520, height: 100, viewBox: "0 0 520 100", style: { display: "flex" }, children: [_jsx("path", { d: "M24 72 Q260 8 496 72", stroke: LINE, strokeWidth: 3, strokeDasharray: "10 10", fill: "none" }), _jsx("circle", { cx: 24, cy: 72, r: 10, fill: PURPLE }), _jsx("circle", { cx: 496, cy: 72, r: 10, fill: PURPLE }), _jsx("path", { d: "M248 28 L268 38 L258 48 L278 38 Z", fill: PURPLE, transform: "rotate(12 258 38)" })] }));
}
function Barcode({ seed }) {
    const bars = [];
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = (hash * 31 + seed.charCodeAt(i)) | 0;
    }
    for (let i = 0; i < 52; i++) {
        hash = (hash * 1103515245 + 12345 + i) | 0;
        const wide = Math.abs(hash) % 4 === 0;
        bars.push(_jsx("div", { style: {
                width: wide ? 5 : 3,
                height: 108,
                backgroundColor: INK,
                marginRight: 2,
                display: "flex",
            } }, i));
    }
    return (_jsx("div", { style: {
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-end",
            width: "100%",
            paddingLeft: 24,
            paddingRight: 24,
        }, children: bars }));
}
function InfoCell({ label, value, align = "center", }) {
    return (_jsxs("div", { style: {
            display: "flex",
            flexDirection: "column",
            alignItems: align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center",
            flex: 1,
        }, children: [_jsx("div", { style: {
                    fontSize: 22,
                    fontWeight: 400,
                    color: LABEL,
                    display: "flex",
                }, children: label }), _jsx("div", { style: {
                    fontSize: 34,
                    fontWeight: 700,
                    color: INK,
                    marginTop: 10,
                    display: "flex",
                }, children: value })] }));
}
function TicketPerforation() {
    return (_jsxs("div", { style: {
            display: "flex",
            alignItems: "center",
            width: "100%",
            position: "relative",
            height: 40,
        }, children: [_jsx("div", { style: {
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: NOTCH,
                    position: "absolute",
                    left: -14,
                    display: "flex",
                } }), _jsx("div", { style: {
                    flex: 1,
                    borderTop: `2px dashed ${LINE}`,
                    marginLeft: 20,
                    marginRight: 20,
                    display: "flex",
                } }), _jsx("div", { style: {
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: NOTCH,
                    position: "absolute",
                    right: -14,
                    display: "flex",
                } })] }));
}
export function FlightCard(data) {
    const origin = data.origin.toUpperCase();
    const destination = data.destination.toUpperCase();
    const originCity = cityName(origin, data.originCity);
    const destCity = cityName(destination, data.destinationCity);
    const optionLabel = formatOptionLabel(data.optionLabel);
    const boardingTime = formatBoardingTime(data.departureTime);
    const flightDate = formatCardDate(data.date);
    const cabin = formatCabin(data.cabinClass);
    const seat = data.seat?.trim() || "--";
    const flightNo = data.flightNumber?.trim() || "--";
    const zone = zoneLabel(data);
    return (_jsxs("div", { style: {
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            backgroundColor: BG,
            color: INK,
            fontFamily: "Inter",
            padding: "40px 44px 48px",
        }, children: [_jsxs("div", { style: {
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    paddingTop: 24,
                    paddingBottom: 36,
                    minHeight: 300,
                }, children: [_jsx(MapPattern, {}), _jsxs("div", { style: {
                            position: "absolute",
                            top: 8,
                            right: 0,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "flex-end",
                        }, children: [_jsx("div", { style: {
                                    fontSize: 20,
                                    color: LABEL,
                                    display: "flex",
                                }, children: "total" }), _jsx("div", { style: {
                                    fontSize: 40,
                                    fontWeight: 700,
                                    color: INK,
                                    display: "flex",
                                }, children: data.price })] }), _jsx("div", { style: {
                            fontSize: 20,
                            fontWeight: 600,
                            color: PURPLE,
                            letterSpacing: 1,
                            textTransform: "uppercase",
                            marginBottom: 28,
                            display: "flex",
                        }, children: optionLabel }), _jsxs("div", { style: {
                            display: "flex",
                            justifyContent: "space-between",
                            width: "100%",
                            paddingLeft: 8,
                            paddingRight: 8,
                        }, children: [_jsxs("div", { style: { display: "flex", flexDirection: "column" }, children: [_jsx("div", { style: {
                                            fontSize: 64,
                                            fontWeight: 700,
                                            letterSpacing: -2,
                                            display: "flex",
                                        }, children: origin }), originCity ? (_jsx("div", { style: {
                                            fontSize: 30,
                                            fontWeight: 700,
                                            marginTop: 6,
                                            display: "flex",
                                        }, children: originCity })) : null] }), _jsxs("div", { style: { display: "flex", flexDirection: "column" }, children: [_jsx("div", { style: {
                                            fontSize: 64,
                                            fontWeight: 700,
                                            letterSpacing: -2,
                                            display: "flex",
                                        }, children: destination }), destCity ? (_jsx("div", { style: {
                                            fontSize: 30,
                                            fontWeight: 700,
                                            marginTop: 6,
                                            display: "flex",
                                        }, children: destCity })) : null] })] }), _jsx("div", { style: { marginTop: 8, display: "flex" }, children: _jsx(RouteArc, {}) })] }), _jsxs("div", { style: {
                    display: "flex",
                    flexDirection: "column",
                    backgroundColor: CARD,
                    borderRadius: 32,
                    padding: "40px 36px 44px",
                    marginBottom: 24,
                }, children: [_jsx("div", { style: {
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            marginBottom: 36,
                            minHeight: 56,
                        }, children: data.logoUrl ? (_jsx("img", { src: data.logoUrl, width: 200, height: 48, style: { objectFit: "contain", display: "flex" } })) : (_jsx("div", { style: {
                                fontSize: 32,
                                fontWeight: 700,
                                color: INK,
                                display: "flex",
                            }, children: data.airline })) }), _jsxs("div", { style: { display: "flex", width: "100%" }, children: [_jsx(InfoCell, { label: "Flight date", value: flightDate || "--" }), _jsx(InfoCell, { label: "Zone", value: zone }), _jsx(InfoCell, { label: "Flight number", value: flightNo })] })] }), _jsxs("div", { style: {
                    display: "flex",
                    flexDirection: "column",
                    backgroundColor: CARD,
                    borderRadius: 32,
                    padding: "40px 36px 44px",
                    flex: 1,
                }, children: [_jsxs("div", { style: { display: "flex", width: "100%" }, children: [_jsx(InfoCell, { label: "Boarding time", value: boardingTime || "--" }), _jsx(InfoCell, { label: "Seat", value: seat }), _jsx(InfoCell, { label: "Class", value: cabin })] }), _jsx("div", { style: { marginTop: 32, marginBottom: 28, display: "flex" }, children: _jsx(TicketPerforation, {}) }), _jsx("div", { style: {
                            fontSize: 30,
                            fontWeight: 600,
                            textAlign: "center",
                            marginBottom: 28,
                            display: "flex",
                            justifyContent: "center",
                        }, children: "Boarding pass" }), _jsx(Barcode, { seed: barcodeSeed(data) }), _jsxs("div", { style: {
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginTop: 32,
                        }, children: [_jsxs("div", { style: {
                                    fontSize: 24,
                                    color: LABEL,
                                    display: "flex",
                                }, children: [origin, " to ", destination] }), _jsx("div", { style: {
                                    fontSize: 26,
                                    fontWeight: 700,
                                    color: INK,
                                    display: "flex",
                                }, children: "remi" })] })] })] }));
}
