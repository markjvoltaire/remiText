import type { RestaurantVenue } from "../types.js";

const RESY_BASE_URL = "https://api.resy.com";

const CITY_COORDS: Record<string, [number, number]> = {
  "new york": [40.7128, -74.006],
  nyc: [40.7128, -74.006],
  manhattan: [40.7589, -73.9851],
  brooklyn: [40.6782, -73.9442],
  queens: [40.7282, -73.7949],
  bronx: [40.8448, -73.8648],
  "staten island": [40.5795, -74.1502],
  williamsburg: [40.7081, -73.9571],
  soho: [40.7233, -74.003],
  chelsea: [40.7465, -74.0014],
  "west village": [40.7358, -74.0036],
  "east village": [40.7265, -73.9815],
  "lower east side": [40.715, -73.9843],
  "upper east side": [40.7736, -73.9566],
  "upper west side": [40.787, -73.9754],
  tribeca: [40.7163, -74.0086],
  harlem: [40.8116, -73.9465],
  midtown: [40.7549, -73.984],
  flatiron: [40.7395, -73.9903],
  greenpoint: [40.7274, -73.9514],
  "los angeles": [34.0522, -118.2437],
  la: [34.0522, -118.2437],
  "west hollywood": [34.09, -118.3617],
  "beverly hills": [34.0736, -118.4004],
  "santa monica": [34.0195, -118.4912],
  "silver lake": [34.0869, -118.2702],
  "san francisco": [37.7749, -122.4194],
  sf: [37.7749, -122.4194],
  chicago: [41.8781, -87.6298],
  miami: [25.7617, -80.1918],
  "south beach": [25.7826, -80.1341],
  wynwood: [25.8011, -80.1996],
  austin: [30.2672, -97.7431],
  houston: [29.7604, -95.3698],
  dallas: [32.7767, -96.797],
  seattle: [47.6062, -122.3321],
  portland: [45.5152, -122.6784],
  boston: [42.3601, -71.0589],
  "washington dc": [38.9072, -77.0369],
  dc: [38.9072, -77.0369],
  philadelphia: [39.9526, -75.1652],
  philly: [39.9526, -75.1652],
  atlanta: [33.749, -84.388],
  nashville: [36.1627, -86.7816],
  denver: [39.7392, -104.9903],
  "san diego": [32.7157, -117.1611],
  "las vegas": [36.1699, -115.1398],
  "new orleans": [29.9511, -90.0715],
  nola: [29.9511, -90.0715],
  minneapolis: [44.9778, -93.265],
  detroit: [42.3314, -83.0458],
  phoenix: [33.4484, -112.074],
  aspen: [39.1911, -106.8175],
  hamptons: [40.9632, -72.1843],
  london: [51.5074, -0.1278],
  paris: [48.8566, 2.3522],
  tokyo: [35.6762, 139.6503],
  toronto: [43.6532, -79.3832],
  "mexico city": [19.4326, -99.1332],
  cdmx: [19.4326, -99.1332],
  cancun: [21.1619, -86.8515],
  tulum: [20.2114, -87.4654],
};

export class ResyNotConfiguredError extends Error {
  constructor() {
    super("Resy is not configured (missing RESY_API_KEY or auth credentials)");
    this.name = "ResyNotConfiguredError";
  }
}

export class ResyAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResyAuthError";
  }
}

export class ResyApiError extends Error {
  readonly status: number;
  constructor(status: number, body: string) {
    super(`Resy API error ${status}: ${body.slice(0, 300)}`);
    this.name = "ResyApiError";
    this.status = status;
  }
}

export interface SearchRestaurantsParams {
  location: string;
  date: string;
  partySize: number;
  query?: string;
}

export interface GetRestaurantAvailabilityParams {
  venueId: number;
  date: string;
  partySize: number;
  /** City or neighborhood used to resolve lat/lng. Resy's /4/find needs geo context even for venue lookups. */
  location?: string;
}

let authToken = "";
let authTokenTimestamp = 0;
const AUTH_TTL_MS = 12 * 60 * 60 * 1000;

export function isResyConfigured(): boolean {
  const apiKey = process.env.RESY_API_KEY?.trim();
  if (!apiKey) return false;
  const hasToken = Boolean(process.env.RESY_AUTH_TOKEN?.trim());
  const hasLogin =
    Boolean(process.env.RESY_EMAIL?.trim()) &&
    Boolean(process.env.RESY_PASSWORD?.trim());
  return hasToken || hasLogin;
}

function getResyApiKey(): string {
  const key = process.env.RESY_API_KEY?.trim();
  if (!key) throw new ResyNotConfiguredError();
  return key;
}

function baseHeaders(): Record<string, string> {
  return {
    Authorization: `ResyAPI api_key="${getResyApiKey()}"`,
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    Origin: "https://resy.com",
    Referer: "https://resy.com/",
    "X-Origin": "https://resy.com",
    "Cache-Control": "no-cache",
  };
}

function authHeaders(): Record<string, string> {
  return {
    ...baseHeaders(),
    "x-resy-auth-token": authToken,
    "x-resy-universal-auth": authToken,
  };
}

async function doLogin(): Promise<string> {
  const email = process.env.RESY_EMAIL?.trim();
  const password = process.env.RESY_PASSWORD?.trim();
  if (!email || !password) {
    throw new ResyAuthError(
      "RESY_EMAIL and RESY_PASSWORD are required when RESY_AUTH_TOKEN is not set",
    );
  }

  let lastError: Error | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) {
      await delay(2 ** attempt * 1000);
    }
    try {
      const body = new URLSearchParams({ email, password });
      const res = await fetch(`${RESY_BASE_URL}/3/auth/password`, {
        method: "POST",
        headers: {
          ...baseHeaders(),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });
      const text = await res.text();
      if (res.status === 500) {
        lastError = new ResyApiError(
          res.status,
          "Resy API returned 500 (likely WAF rate limit)",
        );
        continue;
      }
      if (!res.ok) {
        lastError = new ResyAuthError(
          `Login failed with status ${res.status}: ${text.slice(0, 300)}`,
        );
        continue;
      }
      const result = JSON.parse(text) as { token?: string };
      if (!result.token) {
        lastError = new ResyAuthError("Login response missing token");
        continue;
      }
      return result.token;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError ?? new ResyAuthError("Login failed after 3 attempts");
}

async function ensureAuth(): Promise<string> {
  if (authToken && Date.now() - authTokenTimestamp < AUTH_TTL_MS) {
    return authToken;
  }

  const envToken = process.env.RESY_AUTH_TOKEN?.trim();
  if (envToken) {
    authToken = envToken;
    authTokenTimestamp = Date.now();
    return authToken;
  }

  authToken = await doLogin();
  authTokenTimestamp = Date.now();
  return authToken;
}

async function refreshAuth(): Promise<string> {
  const envToken = process.env.RESY_AUTH_TOKEN?.trim();
  if (envToken) {
    authToken = envToken;
    authTokenTimestamp = Date.now();
    return authToken;
  }
  authToken = await doLogin();
  authTokenTimestamp = Date.now();
  return authToken;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resyGet(
  path: string,
  params?: Record<string, string>,
): Promise<unknown> {
  await ensureAuth();
  const qs = params ? `?${new URLSearchParams(params).toString()}` : "";
  const url = `${RESY_BASE_URL}${path}${qs}`;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await delay(1500 * attempt);

    let res = await fetch(url, { headers: authHeaders() });
    if ((res.status === 401 || res.status === 419) && attempt === 0) {
      await refreshAuth();
      res = await fetch(url, { headers: authHeaders() });
    }
    const text = await res.text();
    if (res.status === 500) continue;
    if (!res.ok) throw new ResyApiError(res.status, text);
    return JSON.parse(text) as unknown;
  }
  throw new ResyApiError(
    500,
    `Resy API returned 500 after retries (GET ${path})`,
  );
}

async function resyPostJson(
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  await ensureAuth();
  const url = `${RESY_BASE_URL}${path}`;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await delay(1500 * attempt);

    let res = await fetch(url, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if ((res.status === 401 || res.status === 419) && attempt === 0) {
      await refreshAuth();
      res = await fetch(url, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    const text = await res.text();
    if (res.status === 500) continue;
    if (!res.ok) throw new ResyApiError(res.status, text);
    return JSON.parse(text) as unknown;
  }
  throw new ResyApiError(
    500,
    `Resy API returned 500 after retries (POST ${path})`,
  );
}

async function resyPostForm(
  path: string,
  fields: Record<string, string>,
): Promise<unknown> {
  await ensureAuth();
  const url = `${RESY_BASE_URL}${path}`;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await delay(1500 * attempt);

    let res = await fetch(url, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(fields).toString(),
    });
    if ((res.status === 401 || res.status === 419) && attempt === 0) {
      await refreshAuth();
      res = await fetch(url, {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(fields).toString(),
      });
    }
    const text = await res.text();
    if (res.status === 500) continue;
    if (!res.ok) throw new ResyApiError(res.status, text);
    return JSON.parse(text) as unknown;
  }
  throw new ResyApiError(
    500,
    `Resy API returned 500 after retries (POST ${path})`,
  );
}

export interface ResyBookingDetails {
  bookToken: string;
  paymentMethodId: number;
  cancellationText?: string;
}

export interface ResyBookedReservation {
  resyToken: string;
  confirmation?: string;
}

export interface ReserveRestaurantTableParams {
  configToken: string;
  date: string;
  partySize: number;
  paymentMethodId?: number;
}

function parsePaymentMethodId(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value))
    return Number.parseInt(value, 10);
  return undefined;
}

function pickPaymentMethodId(
  methods: Array<{ id?: unknown; is_default?: boolean }>,
  override?: number,
): number {
  if (override != null) return override;

  const envId = parsePaymentMethodId(
    process.env.RESY_PAYMENT_METHOD_ID?.trim(),
  );
  if (envId != null) return envId;

  const defaultMethod = methods.find((m) => m.is_default);
  const first = methods[0];
  const id = parsePaymentMethodId(defaultMethod?.id ?? first?.id);
  if (id == null) {
    throw new ResyAuthError(
      "No Resy payment method on file. Add a card in Resy or set RESY_PAYMENT_METHOD_ID.",
    );
  }
  return id;
}

/** Step 1 of booking: exchange config token (from /4/find) for a short-lived book token. */
export async function getBookingDetails(
  configToken: string,
  date: string,
  partySize: number,
): Promise<ResyBookingDetails> {
  if (!isResyConfigured()) throw new ResyNotConfiguredError();

  const data = (await resyPostJson("/3/details", {
    config_id: configToken,
    day: date,
    party_size: partySize,
  })) as {
    book_token?: { value?: string };
    user?: { payment_methods?: Array<{ id?: unknown; is_default?: boolean }> };
    cancellation?: { display_text?: string };
  };

  const bookToken = data.book_token?.value?.trim();
  if (!bookToken) {
    throw new ResyApiError(400, "Resy /3/details did not return a book_token");
  }

  const methods = data.user?.payment_methods ?? [];
  const paymentMethodId = pickPaymentMethodId(methods);

  return {
    bookToken,
    paymentMethodId,
    cancellationText: data.cancellation?.display_text,
  };
}

/** Step 2 of booking: commit reservation with book token + Resy payment method. */
export async function bookReservation(
  bookToken: string,
  paymentMethodId: number,
): Promise<ResyBookedReservation> {
  if (!isResyConfigured()) throw new ResyNotConfiguredError();

  const data = (await resyPostForm("/3/book", {
    book_token: bookToken,
    struct_payment_method: JSON.stringify({ id: paymentMethodId }),
    source_id: "resy.com-venue-details",
    venue_marketing_opt_in: "0",
  })) as {
    resy_token?: string;
    confirmation?: string;
    reservation_id?: string;
  };

  const resyToken = data.resy_token?.trim();
  if (!resyToken) {
    throw new ResyApiError(400, "Resy /3/book did not return resy_token");
  }

  return {
    resyToken,
    confirmation: data.confirmation ?? data.reservation_id,
  };
}

export interface ResyUpcomingReservation {
  resy_token: string;
  reservation_id?: number;
  venue_name: string;
  date: string;
  time: string;
  party_size: number;
  type?: string;
}

/** List upcoming reservations on the configured Resy account (GET /3/user/reservations). */
export async function listUpcomingReservations(): Promise<ResyUpcomingReservation[]> {
  if (!isResyConfigured()) throw new ResyNotConfiguredError();

  const data = (await resyGet("/3/user/reservations")) as Record<string, unknown>;
  const raw = (data.reservations ?? data.upcoming ?? data.results ?? []) as Array<
    Record<string, unknown>
  >;

  const out: ResyUpcomingReservation[] = [];
  for (const r of raw) {
    const resyToken = String(r.resy_token ?? r.token ?? "").trim();
    if (!resyToken) continue;
    const venue = r.venue as Record<string, unknown> | undefined;
    const reservationId = Number(r.reservation_id ?? r.id);
    out.push({
      resy_token: resyToken,
      reservation_id: Number.isFinite(reservationId) && reservationId > 0 ? reservationId : undefined,
      venue_name: String(venue?.name ?? r.venue_name ?? r.name ?? "Unknown"),
      date: String(r.date ?? r.day ?? r.reservation_date ?? ""),
      time: String(r.time_slot ?? r.time ?? r.start_time ?? ""),
      party_size: Number(r.num_seats ?? r.party_size ?? r.seats ?? 0) || 0,
      type: String((r.config as Record<string, unknown> | undefined)?.type ?? r.type ?? "") || undefined,
    });
  }
  return out;
}

/** Cancel a reservation by resy_token (POST /3/cancel, form-encoded). */
export async function cancelReservation(resyToken: string): Promise<void> {
  if (!isResyConfigured()) throw new ResyNotConfiguredError();

  const token = resyToken.trim();
  if (!token) {
    throw new ResyApiError(400, "resy_token is required to cancel");
  }

  await resyPostForm("/3/cancel", { resy_token: token });
}

export async function reserveRestaurantTable(
  params: ReserveRestaurantTableParams,
): Promise<ResyBookedReservation & { paymentMethodId: number }> {
  const details = await getBookingDetails(
    params.configToken,
    params.date,
    params.partySize,
  );
  const booked = await bookReservation(
    details.bookToken,
    params.paymentMethodId ?? details.paymentMethodId,
  );
  return {
    ...booked,
    paymentMethodId: params.paymentMethodId ?? details.paymentMethodId,
  };
}

/** Normalize user time phrases (7pm, 7:00 PM) to match slot labels from Resy. */
export function normalizeReservationTimeLabel(input: string): string | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, " ");
  const match = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (!match) return null;

  let hour = Number.parseInt(match[1]!, 10);
  const minute = match[2] ?? "00";
  const period = match[3]!.toUpperCase() as "AM" | "PM";

  if (period === "PM" && hour < 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;

  const outPeriod = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${minute} ${outPeriod}`;
}

export function slotMatchesUserTime(
  slotTime: string,
  userTime: string,
): boolean {
  const slot = slotTime.trim();
  const raw = userTime.trim();
  if (!slot || !raw) return false;
  if (slot.toLowerCase() === raw.toLowerCase()) return true;

  const normalized = normalizeReservationTimeLabel(raw);
  if (normalized && slot === normalized) return true;

  return slot.toLowerCase().startsWith(raw.toLowerCase());
}

export function findVenueSlotByTime(
  venue: {
    slots: Array<{ time: string; config_token: string; slot_type: string }>;
  },
  time: string,
): { time: string; config_token: string; slot_type: string } | null {
  return venue.slots.find((s) => slotMatchesUserTime(s.time, time)) ?? null;
}

export function resolveLocation(location: string): [number, number] {
  const locLower = location.trim().toLowerCase();
  if (locLower in CITY_COORDS) return CITY_COORDS[locLower]!;
  for (const [city, coords] of Object.entries(CITY_COORDS)) {
    if (city.includes(locLower) || locLower.includes(city)) return coords;
  }
  return CITY_COORDS["new york"]!;
}

function formatSlotTime(start: string): string {
  if (!start) return "";
  const match = start.match(/(\d{2}):(\d{2})/);
  if (!match) return start;
  const hour = Number.parseInt(match[1]!, 10);
  const minute = match[2]!;
  const period = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${minute} ${period}`;
}

function priceRangeDisplay(priceRange: number): string {
  if (!priceRange || priceRange < 1) return "";
  return "$".repeat(Math.min(priceRange, 4));
}

interface ResySlotRaw {
  config?: { type?: string; token?: string };
  date?: { start?: string; end?: string };
}

interface ResyVenueRaw {
  venue?: {
    id?: { resy?: number } | number;
    name?: string;
    cuisine?: string[];
    neighborhood?: string;
    price_range?: number;
    rating?: { average?: number; count?: number } | number;
    location?: { address_1?: string; city?: string; state?: string };
    images?: string[];
    responsive_images?: { originals?: Record<string, unknown> };
    venue_template_photo?: string;
    icon?: string;
  };
  slots?: ResySlotRaw[];
}

function extractVenueId(venueData: ResyVenueRaw): number {
  const id = venueData.venue?.id;
  if (typeof id === "number") return id;
  if (id && typeof id === "object" && typeof id.resy === "number")
    return id.resy;
  return 0;
}

function asHttpUrl(value: unknown): string | undefined {
  if (typeof value === "string" && value.startsWith("http")) return value;
  if (value && typeof value === "object" && "url" in value) {
    const url = (value as { url?: unknown }).url;
    if (typeof url === "string" && url.startsWith("http")) return url;
  }
  return undefined;
}

function pickVenueImageUrl(
  venue: NonNullable<ResyVenueRaw["venue"]>,
): string | undefined {
  for (const candidate of venue.images ?? []) {
    const url = asHttpUrl(candidate);
    if (url) return url;
  }

  const originals = venue.responsive_images?.originals;
  if (originals) {
    for (const key of ["4:3", "16:9", "1:1"]) {
      const url = asHttpUrl(originals[key]);
      if (url) return url;
    }
    for (const value of Object.values(originals)) {
      const url = asHttpUrl(value);
      if (url) return url;
    }
  }

  return asHttpUrl(venue.venue_template_photo) ?? asHttpUrl(venue.icon);
}

function mapVenue(venueData: ResyVenueRaw): RestaurantVenue | null {
  const venue = venueData.venue;
  if (!venue?.name) return null;

  const venueId = extractVenueId(venueData);
  if (!venueId) return null;

  const cuisine = Array.isArray(venue.cuisine) ? venue.cuisine.join(", ") : "";
  const rating =
    typeof venue.rating === "object" && venue.rating?.average != null
      ? venue.rating.average
      : typeof venue.rating === "number"
        ? venue.rating
        : undefined;

  const slots = (venueData.slots ?? []).slice(0, 40).map((slot) => ({
    time: formatSlotTime(slot.date?.start ?? ""),
    slot_type: slot.config?.type ?? "Standard",
    config_token: slot.config?.token ?? "",
  }));

  return {
    venue_id: venueId,
    name: venue.name,
    cuisine,
    neighborhood: venue.neighborhood ?? "",
    price_range: venue.price_range ?? 0,
    rating,
    image_url: pickVenueImageUrl(venue),
    slots,
  };
}

function filterByQuery(
  venues: RestaurantVenue[],
  query: string,
): RestaurantVenue[] {
  const q = query.trim().toLowerCase();
  if (!q) return venues;
  return venues.filter((v) => {
    const haystack = `${v.name} ${v.cuisine} ${v.neighborhood}`.toLowerCase();
    return haystack.includes(q);
  });
}

/** Trailing neighborhood/city tokens Resy often appends to chain venue names. */
const VENUE_NAME_LOCATION_SUFFIXES = [
  "south beach",
  "miami beach",
  "coral gables",
  "design district",
  "downtown miami",
  "brickell miami",
  "midtown miami",
  "wynwood",
  "brickell",
  "midtown",
  "miami",
  "manhattan",
  "brooklyn",
  "williamsburg",
  "soho",
  "chelsea",
  "tribeca",
  "west village",
  "east village",
  "harlem",
  "nyc",
];

/**
 * Canonical key for deduping multi-location chains (e.g. three "Bondi Sushi" outposts).
 */
export function restaurantBrandKey(name: string): string {
  let base = name.trim().toLowerCase();
  const dashParts = base.split(/\s*[-–—]\s*/);
  if (dashParts.length > 1) {
    base = dashParts[0]!.trim();
  }

  const sortedSuffixes = [...VENUE_NAME_LOCATION_SUFFIXES].sort(
    (a, b) => b.length - a.length,
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of sortedSuffixes) {
      if (base.endsWith(` ${suffix}`)) {
        base = base.slice(0, -(suffix.length + 1)).trim();
        changed = true;
        break;
      }
    }
  }

  return base;
}

/** Keep the first venue per brand so recommendations show distinct restaurants. */
export function dedupeVenuesByBrand(
  venues: RestaurantVenue[],
  maxResults = 5,
): RestaurantVenue[] {
  const seen = new Set<string>();
  const out: RestaurantVenue[] = [];

  for (const venue of venues) {
    const key = restaurantBrandKey(venue.name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(venue);
    if (out.length >= maxResults) break;
  }

  return out;
}

function parseFindResponse(data: unknown): RestaurantVenue[] {
  const results = (data as { results?: { venues?: ResyVenueRaw[] } })?.results;
  const rawVenues = results?.venues ?? [];
  return rawVenues
    .map(mapVenue)
    .filter((v): v is RestaurantVenue => v !== null);
}

async function fetchAvailability(
  params: Record<string, string>,
): Promise<RestaurantVenue[]> {
  const data = await resyGet("/4/find", params);
  return parseFindResponse(data);
}

export async function searchRestaurants(
  params: SearchRestaurantsParams,
): Promise<RestaurantVenue[]> {
  if (!isResyConfigured()) throw new ResyNotConfiguredError();
  if (params.partySize < 1 || params.partySize > 20) {
    throw new Error("Party size must be between 1 and 20");
  }

  const [lat, lng] = resolveLocation(params.location);
  const venues = await fetchAvailability({
    lat: String(lat),
    long: String(lng),
    day: params.date,
    party_size: String(params.partySize),
  });

  const filtered = filterByQuery(venues, params.query ?? "");
  return dedupeVenuesByBrand(filtered, 5);
}

export async function getRestaurantAvailability(
  params: GetRestaurantAvailabilityParams,
): Promise<RestaurantVenue | null> {
  if (!isResyConfigured()) throw new ResyNotConfiguredError();
  if (params.partySize < 1 || params.partySize > 20) {
    throw new Error("Party size must be between 1 and 20");
  }

  const [lat, lng] = resolveLocation(params.location ?? "new york");

  const venues = await fetchAvailability({
    venue_id: String(params.venueId),
    day: params.date,
    party_size: String(params.partySize),
    lat: String(lat),
    long: String(lng),
  });

  return venues.find((v) => v.venue_id === params.venueId) ?? venues[0] ?? null;
}

export function formatResyError(err: unknown): string {
  if (err instanceof ResyNotConfiguredError) {
    return "Dining search is temporarily unavailable.";
  }
  if (err instanceof ResyAuthError) {
    return "Could not connect to Resy. Please try again later.";
  }
  if (err instanceof ResyApiError) {
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

if (isResyConfigured()) {
  console.log("[resy] credentials present");
} else {
  console.warn(
    "[resy] not configured — set RESY_API_KEY and RESY_AUTH_TOKEN (or email/password)",
  );
}
