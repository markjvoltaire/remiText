import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const TICKET = "#F4F3F0";
const INK = "#050505";
const MUTED = "rgba(0,0,0,0.6)";
const LINE = "rgba(0,0,0,0.16)";
const ACCENT = "#E1306C";
const IG_ORANGE = "#F77737";
const IG_YELLOW = "#FCAF45";
const IG_PURPLE = "#833AB4";
const IG_BLUE = "#405DE6";
function stopsLabel(stops) {
    if (stops == null)
        return "Nonstop";
    if (stops <= 0)
        return "Nonstop";
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
function PlaneIcon({ size = 52, color = INK, }) {
    return (_jsx("svg", { width: size, height: size, viewBox: "0 0 64 64", xmlns: "http://www.w3.org/2000/svg", style: { display: "block" }, children: _jsx("path", { d: "M58 31.5c0 2.1-1.7 3.7-3.8 3.7H39.4L28.2 53.5h-5.1l5.2-18.3H16.6l-4.2 5.4H8.2l2.4-9.1-2.4-9.1h4.2l4.2 5.4h11.7L23.1 9.5h5.1l11.2 18.3h14.8c2.1 0 3.8 1.6 3.8 3.7Z", fill: color }) }));
}
function MiniArrow({ size = 36, color = MUTED, }) {
    const stroke = Math.max(2, Math.round(size / 12));
    return (_jsx("svg", { width: size, height: size / 2, viewBox: "0 0 56 28", xmlns: "http://www.w3.org/2000/svg", style: { display: "block" }, children: _jsx("path", { d: "M4 14 L48 14 M38 5 L50 14 L38 23", stroke: color, strokeWidth: stroke, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" }) }));
}
function DetailItem({ value, label, align = "center", width = 160, }) {
    return (_jsxs("div", { style: {
            width,
            display: "flex",
            flexDirection: "column",
            alignItems: align,
        }, children: [_jsx("div", { style: {
                    color: MUTED,
                    fontSize: 34,
                    fontWeight: 400,
                    lineHeight: 1.1,
                    whiteSpace: "nowrap",
                }, children: value }), _jsx("div", { style: {
                    color: INK,
                    fontSize: 28,
                    fontWeight: 700,
                    lineHeight: 1.25,
                    marginTop: 6,
                    whiteSpace: "nowrap",
                }, children: label })] }));
}
export function FlightCard(data) {
    const stops = stopsLabel(data.stops);
    const cabinClass = data.cabinClass ?? "Economy";
    const date = data.date ?? "Flight option";
    const flightNumber = data.flightNumber ?? "Flight";
    const optionLabel = data.optionLabel ?? "Remi flight";
    const hasLogo = Boolean(data.logoUrl);
    return (_jsx("div", { style: {
            width: "100%",
            height: "100%",
            display: "flex",
            backgroundColor: TICKET,
            color: INK,
            fontFamily: "Inter",
            position: "relative",
        }, children: _jsxs("div", { style: {
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                position: "relative",
                backgroundColor: TICKET,
                padding: "86px 80px 72px",
                overflow: "hidden",
            }, children: [_jsxs("div", { style: {
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        height: 18,
                        display: "flex",
                    }, children: [_jsx("div", { style: { flex: 1, backgroundColor: IG_YELLOW } }), _jsx("div", { style: { flex: 1, backgroundColor: IG_ORANGE } }), _jsx("div", { style: { flex: 1, backgroundColor: ACCENT } }), _jsx("div", { style: { flex: 1, backgroundColor: IG_PURPLE } }), _jsx("div", { style: { flex: 1, backgroundColor: IG_BLUE } })] }), _jsxs("div", { style: {
                        position: "absolute",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: 10,
                        display: "flex",
                        opacity: 0.95,
                    }, children: [_jsx("div", { style: { flex: 1, backgroundColor: IG_BLUE } }), _jsx("div", { style: { flex: 1, backgroundColor: IG_PURPLE } }), _jsx("div", { style: { flex: 1, backgroundColor: ACCENT } }), _jsx("div", { style: { flex: 1, backgroundColor: IG_ORANGE } }), _jsx("div", { style: { flex: 1, backgroundColor: IG_YELLOW } })] }), _jsx("div", { style: {
                        position: "absolute",
                        top: 18,
                        right: 0,
                        width: 178,
                        height: 178,
                        borderBottomLeftRadius: 178,
                        backgroundColor: IG_YELLOW,
                        opacity: 0.12,
                    } }), _jsx("div", { style: {
                        position: "absolute",
                        top: 92,
                        right: 28,
                        width: 126,
                        height: 126,
                        borderRadius: "50%",
                        backgroundColor: ACCENT,
                        opacity: 0.08,
                    } }), _jsx("div", { style: {
                        position: "absolute",
                        left: -34,
                        top: 548,
                        width: 68,
                        height: 68,
                        borderRadius: "50%",
                        backgroundColor: IG_PURPLE,
                    } }), _jsx("div", { style: {
                        position: "absolute",
                        right: -34,
                        top: 548,
                        width: 68,
                        height: 68,
                        borderRadius: "50%",
                        backgroundColor: IG_ORANGE,
                    } }), _jsxs("div", { style: {
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                    }, children: [_jsxs("div", { style: { display: "flex", flexDirection: "column" }, children: [_jsx("div", { style: {
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        alignSelf: "flex-start",
                                        padding: "12px 22px",
                                        borderRadius: 999,
                                        border: `2px solid ${LINE}`,
                                        color: MUTED,
                                        fontSize: 26,
                                        fontWeight: 700,
                                        letterSpacing: 2,
                                        textTransform: "uppercase",
                                    }, children: optionLabel }), _jsx("div", { style: {
                                        color: MUTED,
                                        fontSize: 34,
                                        fontWeight: 400,
                                        marginTop: 26,
                                    }, children: "Boarding pass" })] }), _jsxs("div", { style: {
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "flex-end",
                            }, children: [_jsx("div", { style: { color: MUTED, fontSize: 34, fontWeight: 400 }, children: "Total" }), _jsx("div", { style: {
                                        color: ACCENT,
                                        fontSize: 96,
                                        fontWeight: 700,
                                        lineHeight: 0.95,
                                        marginTop: 6,
                                    }, children: data.price })] })] }), _jsxs("div", { style: {
                        display: "flex",
                        flexDirection: "column",
                        marginTop: 122,
                    }, children: [_jsxs("div", { style: {
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "flex-start",
                            }, children: [_jsxs("div", { style: {
                                        width: 270,
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: hasLogo ? "flex-start" : "center",
                                    }, children: [data.logoUrl ? (_jsx("img", { src: data.logoUrl, width: 250, height: 82, style: { objectFit: "contain" } })) : (_jsx("div", { style: {
                                                width: 74,
                                                height: 74,
                                                borderRadius: "50%",
                                                backgroundColor: ACCENT,
                                                color: "#FFFFFF",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                fontSize: 30,
                                                fontWeight: 700,
                                                letterSpacing: -0.5,
                                            }, children: airlineInitials(data.airline) })), !hasLogo ? (_jsx("div", { style: {
                                                color: INK,
                                                fontSize: 30,
                                                fontWeight: 700,
                                                marginTop: 16,
                                                textAlign: "center",
                                                lineHeight: 1.1,
                                            }, children: data.airline })) : null] }), _jsx("div", { style: {
                                        color: INK,
                                        fontSize: 38,
                                        fontWeight: 400,
                                        marginTop: 24,
                                        textAlign: "right",
                                    }, children: date })] }), _jsxs("div", { style: {
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginTop: 132,
                            }, children: [_jsxs("div", { style: {
                                        width: 285,
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "flex-start",
                                    }, children: [_jsx("div", { style: {
                                                fontSize: 66,
                                                fontWeight: 700,
                                                lineHeight: 1,
                                                letterSpacing: -1,
                                            }, children: data.departureTime }), _jsx("div", { style: {
                                                color: MUTED,
                                                fontSize: 56,
                                                fontWeight: 700,
                                                lineHeight: 1.15,
                                                marginTop: 10,
                                            }, children: data.origin })] }), _jsxs("div", { style: {
                                        width: 300,
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                    }, children: [_jsx(PlaneIcon, { size: 78 }), _jsx("div", { style: {
                                                color: INK,
                                                fontSize: 38,
                                                fontWeight: 400,
                                                lineHeight: 1.1,
                                                marginTop: 13,
                                                textAlign: "center",
                                            }, children: data.duration }), _jsx("div", { style: {
                                                color: INK,
                                                fontSize: 38,
                                                fontWeight: 400,
                                                lineHeight: 1.1,
                                                marginTop: 4,
                                                textAlign: "center",
                                            }, children: stops })] }), _jsxs("div", { style: {
                                        width: 285,
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "flex-end",
                                    }, children: [_jsx("div", { style: {
                                                fontSize: 66,
                                                fontWeight: 700,
                                                lineHeight: 1,
                                                letterSpacing: -1,
                                            }, children: data.arrivalTime }), _jsx("div", { style: {
                                                color: MUTED,
                                                fontSize: 56,
                                                fontWeight: 700,
                                                lineHeight: 1.15,
                                                marginTop: 10,
                                            }, children: data.destination })] })] }), _jsx("div", { style: {
                                height: 2,
                                backgroundColor: LINE,
                                marginTop: 110,
                            } })] }), _jsxs("div", { style: {
                        display: "flex",
                        flexDirection: "column",
                        marginTop: 62,
                    }, children: [_jsxs("div", { style: {
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "flex-start",
                            }, children: [_jsx(DetailItem, { value: cabinClass, label: "Class", align: "flex-start", width: 214 }), _jsx(DetailItem, { value: data.gate ?? stops, label: data.gate ? "Gate" : "Stops", width: 214 }), _jsx(DetailItem, { value: data.terminal ?? data.origin, label: data.terminal ? "Terminal" : "From", width: 214 }), _jsx(DetailItem, { value: flightNumber, label: "Flight", align: "flex-end", width: 244 })] }), _jsx("div", { style: {
                                height: 2,
                                backgroundColor: LINE,
                                marginTop: 58,
                            } })] }), _jsxs("div", { style: {
                        marginTop: "auto",
                        alignItems: "center",
                        display: "flex",
                        justifyContent: "space-between",
                    }, children: [_jsxs("div", { style: {
                                color: MUTED,
                                display: "flex",
                                alignItems: "center",
                                gap: 16,
                                fontSize: 36,
                                fontWeight: 400,
                            }, children: [_jsx("span", { children: data.origin }), _jsx(MiniArrow, { size: 38 }), _jsx("span", { children: data.destination })] }), _jsx("div", { style: {
                                color: INK,
                                display: "flex",
                                fontSize: 38,
                                fontWeight: 700,
                                letterSpacing: 4,
                            }, children: "REMI" })] })] }) }));
}
