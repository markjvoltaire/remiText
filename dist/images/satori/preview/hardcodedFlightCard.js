import { FlightCard } from '../templates/FlightCard.js';
/** Sample data for local preview / design iteration (not used in production flows). */
export const HARDCODED_FLIGHT_CARD_INPUT = {
    airline: 'American Airlines',
    origin: 'MIA',
    destination: 'JFK',
    departureTime: '8:30 AM',
    arrivalTime: '11:25 AM',
    price: '$89',
    duration: '2h 55m',
    stops: 0,
    date: 'May 28th 2026',
    cabinClass: 'Economy',
    flightNumber: 'AA 102',
    optionLabel: 'Option 1',
};
export function hardcodedFlightCard() {
    return FlightCard(HARDCODED_FLIGHT_CARD_INPUT);
}
