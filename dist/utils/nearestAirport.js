/** Major commercial airports for nearest-airport lookup from shared coordinates. */
const AIRPORTS = [
    { iata: 'ATL', city: 'Atlanta', lat: 33.6407, lng: -84.4277 },
    { iata: 'AUS', city: 'Austin', lat: 30.1975, lng: -97.6664 },
    { iata: 'BNA', city: 'Nashville', lat: 36.1245, lng: -86.6782 },
    { iata: 'BOS', city: 'Boston', lat: 42.3656, lng: -71.0096 },
    { iata: 'BWI', city: 'Baltimore', lat: 39.1754, lng: -76.6683 },
    { iata: 'CLT', city: 'Charlotte', lat: 35.214, lng: -80.9431 },
    { iata: 'DCA', city: 'Washington DC', lat: 38.8512, lng: -77.0402 },
    { iata: 'DEN', city: 'Denver', lat: 39.8561, lng: -104.6737 },
    { iata: 'DFW', city: 'Dallas', lat: 32.8998, lng: -97.0403 },
    { iata: 'DTW', city: 'Detroit', lat: 42.2162, lng: -83.3554 },
    { iata: 'EWR', city: 'Newark', lat: 40.6895, lng: -74.1745 },
    { iata: 'FLL', city: 'Fort Lauderdale', lat: 26.0726, lng: -80.1527 },
    { iata: 'HNL', city: 'Honolulu', lat: 21.3187, lng: -157.9225 },
    { iata: 'IAD', city: 'Washington Dulles', lat: 38.9531, lng: -77.4565 },
    { iata: 'IAH', city: 'Houston', lat: 29.9902, lng: -95.3368 },
    { iata: 'JFK', city: 'New York', lat: 40.6413, lng: -73.7781 },
    { iata: 'LAS', city: 'Las Vegas', lat: 36.084, lng: -115.1537 },
    { iata: 'LAX', city: 'Los Angeles', lat: 33.9425, lng: -118.4081 },
    { iata: 'LGA', city: 'New York LaGuardia', lat: 40.7769, lng: -73.874 },
    { iata: 'MCO', city: 'Orlando', lat: 28.4312, lng: -81.3081 },
    { iata: 'MDW', city: 'Chicago Midway', lat: 41.7868, lng: -87.7522 },
    { iata: 'MIA', city: 'Miami', lat: 25.7959, lng: -80.287 },
    { iata: 'MSP', city: 'Minneapolis', lat: 44.8848, lng: -93.2223 },
    { iata: 'OAK', city: 'Oakland', lat: 37.7126, lng: -122.2197 },
    { iata: 'ORD', city: 'Chicago', lat: 41.9742, lng: -87.9073 },
    { iata: 'PDX', city: 'Portland', lat: 45.5898, lng: -122.5951 },
    { iata: 'PHL', city: 'Philadelphia', lat: 39.8744, lng: -75.2424 },
    { iata: 'PHX', city: 'Phoenix', lat: 33.4373, lng: -112.0078 },
    { iata: 'SAN', city: 'San Diego', lat: 32.7338, lng: -117.1933 },
    { iata: 'SEA', city: 'Seattle', lat: 47.4502, lng: -122.3088 },
    { iata: 'SFO', city: 'San Francisco', lat: 37.6213, lng: -122.379 },
    { iata: 'SJC', city: 'San Jose', lat: 37.3639, lng: -121.9289 },
    { iata: 'SLC', city: 'Salt Lake City', lat: 40.7899, lng: -111.9791 },
    { iata: 'TPA', city: 'Tampa', lat: 27.9755, lng: -82.5332 },
    { iata: 'CDG', city: 'Paris', lat: 49.0097, lng: 2.5479 },
    { iata: 'LHR', city: 'London', lat: 51.47, lng: -0.4543 },
    { iata: 'AMS', city: 'Amsterdam', lat: 52.3105, lng: 4.7683 },
    { iata: 'FRA', city: 'Frankfurt', lat: 50.0379, lng: 8.5622 },
    { iata: 'MAD', city: 'Madrid', lat: 40.4983, lng: -3.5676 },
    { iata: 'BCN', city: 'Barcelona', lat: 41.2974, lng: 2.0833 },
    { iata: 'FCO', city: 'Rome', lat: 41.8003, lng: 12.2389 },
    { iata: 'MXP', city: 'Milan', lat: 45.6306, lng: 8.7281 },
    { iata: 'NRT', city: 'Tokyo Narita', lat: 35.772, lng: 140.3929 },
    { iata: 'HND', city: 'Tokyo Haneda', lat: 35.5494, lng: 139.7798 },
    { iata: 'ICN', city: 'Seoul', lat: 37.4602, lng: 126.4407 },
    { iata: 'SIN', city: 'Singapore', lat: 1.3644, lng: 103.9915 },
    { iata: 'DXB', city: 'Dubai', lat: 25.2532, lng: 55.3657 },
    { iata: 'SYD', city: 'Sydney', lat: -33.9399, lng: 151.1753 },
    { iata: 'YYZ', city: 'Toronto', lat: 43.6777, lng: -79.6248 },
    { iata: 'YVR', city: 'Vancouver', lat: 49.1967, lng: -123.1815 },
    { iata: 'MEX', city: 'Mexico City', lat: 19.4363, lng: -99.0721 },
    { iata: 'GRU', city: 'São Paulo', lat: -23.4356, lng: -46.4731 },
];
function haversineKm(lat1, lng1, lat2, lng2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
export function nearestAirports(latitude, longitude, limit = 2, maxKm = 120) {
    const ranked = AIRPORTS.map((airport) => ({
        iata: airport.iata,
        city: airport.city,
        distanceKm: haversineKm(latitude, longitude, airport.lat, airport.lng),
    })).sort((a, b) => a.distanceKm - b.distanceKm);
    const withinRange = ranked.filter((airport) => airport.distanceKm <= maxKm);
    const picks = (withinRange.length > 0 ? withinRange : ranked.slice(0, 1)).slice(0, limit);
    return picks.map((airport) => ({
        iata: airport.iata,
        city: airport.city,
        distanceKm: Math.round(airport.distanceKm),
    }));
}
