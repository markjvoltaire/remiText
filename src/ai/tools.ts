import type Anthropic from '@anthropic-ai/sdk';

export const tools: Anthropic.Tool[] = [
  {
    name: 'search_flights',
    description:
      'Search for available flights. Returns up to 5 offers sorted by price. Always call this before presenting options to the user.',
    input_schema: {
      type: 'object',
      properties: {
        origin: {
          type: 'string',
          description: 'IATA airport code for departure, e.g. "JFK"',
        },
        destination: {
          type: 'string',
          description: 'IATA airport code for arrival, e.g. "LAX"',
        },
        departure_date: {
          type: 'string',
          description: 'Departure date in YYYY-MM-DD format',
        },
        return_date: {
          type: 'string',
          description:
            'Optional return date in YYYY-MM-DD format. If provided, search a round trip (2 slices). If omitted, search one-way.',
        },
        cabin_class: {
          type: 'string',
          enum: ['economy', 'premium_economy', 'business', 'first'],
          description: 'Cabin class. Defaults to economy.',
        },
        adult_count: {
          type: 'number',
          description: 'Number of adult passengers. Defaults to 1.',
        },
      },
      required: ['origin', 'destination', 'departure_date'],
    },
  },
  {
    name: 'hold_flight',
    description:
      "Reserve a specific flight offer without charging payment, using the user's stored passenger details. Only works when the offer permits pay-later (e.g. Duffel Airways and some legacy carriers). If the offer requires instant payment (e.g. Frontier and most low-cost carriers), this returns { error: true, instant_only: true } and the user should be asked to BOOK instead.",
    input_schema: {
      type: 'object',
      properties: {
        offer_id: {
          type: 'string',
          description: 'The Duffel offer ID to hold',
        },
      },
      required: ['offer_id'],
    },
  },
  {
    name: 'book_flight',
    description:
      "Charge the user's stored payment method and create a fully paid Duffel order in one step (`type: 'instant'` with payment in the same request). Use this whenever the user wants to book and pay now — including any clear affirmative reply (e.g. BOOK, book it, get it, buy it, lock it in, do it, yes, yep, sure, ok, go ahead) given just after a 'HOLD or BOOK?' confirmation question on a specific flight. Works for both pay-later and instant-payment carriers.",
    input_schema: {
      type: 'object',
      properties: {
        offer_id: {
          type: 'string',
          description: 'The Duffel offer ID to book',
        },
      },
      required: ['offer_id'],
    },
  },
  {
    name: 'confirm_booking',
    description:
      'Finalize payment for a previously held (pay_later) order. Charges the user via Stripe and submits the payment to Duffel from balance. Only use when an order is already held via hold_flight; for fresh bookings prefer book_flight.',
    input_schema: {
      type: 'object',
      properties: {
        order_id: {
          type: 'string',
          description: 'The Duffel held order ID to pay for',
        },
        amount: {
          type: 'string',
          description: 'The exact amount to charge (e.g. "278.00")',
        },
        currency: {
          type: 'string',
          description: 'Three-letter currency code (e.g. "usd")',
        },
      },
      required: [],
    },
  },
  {
    name: 'search_restaurants',
    description:
      'Search Resy for restaurants with open reservation times. Call when the user asks for a table, dinner spot, or restaurant availability. Returns a formatted list of venues with time slots.',
    input_schema: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'City or neighborhood, e.g. "Manhattan", "West Village", "Miami"',
        },
        date: {
          type: 'string',
          description: 'Reservation date in YYYY-MM-DD format (resolve relative dates first)',
        },
        party_size: {
          type: 'number',
          description: 'Number of guests. Defaults to 2.',
        },
        query: {
          type: 'string',
          description: 'Optional filter by restaurant name or cuisine, e.g. "italian", "sushi", "STK Miami"',
        },
        meal_period: {
          type: 'string',
          description:
            'When the user specifies time of day: "night" or "dinner" or "evening" for 5pm+ slots; "lunch", "brunch", "breakfast", "afternoon", "late_night". Omit if they did not specify.',
        },
      },
      required: ['location', 'date'],
    },
  },
  {
    name: 'get_restaurant_availability',
    description:
      'Get full availability for one restaurant from the latest search. Call when the user picks a venue by name or position (first, second, etc.) from search_restaurants results.',
    input_schema: {
      type: 'object',
      properties: {
        venue_id: {
          type: 'number',
          description: 'Resy venue ID from the latest search_restaurants results',
        },
        date: {
          type: 'string',
          description: 'Reservation date in YYYY-MM-DD format',
        },
        party_size: {
          type: 'number',
          description: 'Number of guests. Defaults to 2.',
        },
      },
      required: ['venue_id', 'date'],
    },
  },
  {
    name: 'book_restaurant_table',
    description:
      'Stage or complete a Resy table booking. First call (confirm=false/omitted) when the user says book/reserve with a time — returns a confirmation SMS; do not book yet. Second call (confirm=true) only after they reply yes to that confirmation. Use venue_id from the latest search.',
    input_schema: {
      type: 'object',
      properties: {
        venue_id: {
          type: 'number',
          description: 'Resy venue ID from the latest restaurant search',
        },
        date: {
          type: 'string',
          description: 'Reservation date YYYY-MM-DD (use latest search date if known)',
        },
        party_size: {
          type: 'number',
          description: 'Number of guests. Defaults to latest search party size.',
        },
        time: {
          type: 'string',
          description: 'Reservation time exactly as shown in availability, e.g. "7:00 PM" or "7pm"',
        },
        confirm: {
          type: 'boolean',
          description:
            'Set true only after the user replied yes to a "Just to confirm" message. Omit or false on the first book request.',
        },
      },
      required: ['venue_id', 'date', 'time'],
    },
  },
  {
    name: 'list_restaurant_reservations',
    description:
      'List the user\'s upcoming restaurant reservations booked through Remi (and on the Resy account). Call when they ask what reservations they have, upcoming dinners, or before cancelling if unclear which one.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'search_events',
    description:
      'Search Ticketmaster for concerts, sports, theater, and live events. Call when the user asks for tickets, shows, concerts, games, or what is happening in a city on specific dates. Returns a curated SMS list (max 5). Resolve relative dates first. Default to the user home city when no location is given.',
    input_schema: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: 'City name, e.g. "New York", "Miami", "Austin"',
        },
        state_code: {
          type: 'string',
          description: 'US state code when helpful, e.g. "NY", "FL"',
        },
        keyword: {
          type: 'string',
          description: 'Artist, team, genre, or event name, e.g. "Taylor Swift", "Knicks", "comedy"',
        },
        start_date_time: {
          type: 'string',
          description: 'ISO-8601 start filter, e.g. "2026-06-01T00:00:00Z"',
        },
        end_date_time: {
          type: 'string',
          description: 'ISO-8601 end filter',
        },
        segment_name: {
          type: 'string',
          description: 'Music, Sports, Arts & Theatre, Family, etc.',
        },
        classification_name: {
          type: 'string',
          description: 'Genre or classification filter, e.g. rock, comedy',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_event_details',
    description:
      'Get full Ticketmaster details for one event by ID from search_events results. Call when the user picks an event by name or position, or asks for more info on a specific show.',
    input_schema: {
      type: 'object',
      properties: {
        event_id: {
          type: 'string',
          description: 'Ticketmaster event ID from search_events',
        },
      },
      required: ['event_id'],
    },
  },
  {
    name: 'search_tiktok',
    description:
      'Search social trends in parallel for things to do, eat, nightlife, and events. Call only after the user gave a specific vibe/mood (not for vague requests like "something fun in Miami" — ask their mood first). Call this OR search_instagram, not both. User-facing replies must not mention TikTok, Instagram, or other platforms. Returns slim trend items to synthesize — never paste raw API data.',
    input_schema: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'City or area, e.g. "Miami", "West Village", "Austin"',
        },
        vibe: {
          type: 'string',
          description:
            'Specific mood the user stated in this or the prior message, e.g. "afrobeats clubs", "romantic date night", "house music", "rooftop brunch". Do not invent for vague requests.',
        },
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description:
            '1-2 TikTok search keyword phrases combining location + the user\'s stated vibe, e.g. ["miami afrobeats nightlife"] — only the first is used per call.',
        },
        instagram_hashtags: {
          type: 'array',
          items: { type: 'string' },
          description:
            '1-2 Instagram hashtags matching the vibe, e.g. ["miamiafrobeats", "miaminightlife"] — only the first is used per call.',
        },
      },
      required: ['location', 'vibe', 'keywords', 'instagram_hashtags'],
    },
  },
  {
    name: 'search_instagram',
    description:
      'Search social trends in parallel for venues, parties, and events. Call only after the user gave a specific vibe/mood (not for vague "something fun in [city]" — ask their mood first). Call this OR search_tiktok, not both. User-facing replies must not mention TikTok, Instagram, or other platforms. Returns slim trend items to synthesize — never paste raw API data.',
    input_schema: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'City or area, e.g. "Miami", "West Village", "Austin"',
        },
        vibe: {
          type: 'string',
          description:
            'Specific mood the user stated in this or the prior message, e.g. "afrobeats clubs", "romantic date night", "house music". Do not invent for vague requests.',
        },
        hashtags: {
          type: 'array',
          items: { type: 'string' },
          description:
            '1-2 Instagram hashtags matching location + vibe, e.g. ["miamiafrobeats", "miaminightlife"] — only the first is used per call.',
        },
        tiktok_keywords: {
          type: 'array',
          items: { type: 'string' },
          description:
            '1-2 TikTok keyword phrases matching location + vibe, e.g. ["miami afrobeats nightlife"] — only the first is used per call.',
        },
      },
      required: ['location', 'vibe', 'hashtags', 'tiktok_keywords'],
    },
  },
  {
    name: 'cancel_restaurant_reservation',
    description:
      'Cancel an existing Resy table reservation. Call when the user wants to cancel a restaurant booking (e.g. "cancel my reservation", "cancel dinner at Bondi", "cancel the 7pm"). Use resy_token if known; otherwise venue_name and optional date to match. If multiple match, the tool returns a numbered list — ask the user to pick one, then call again with resy_token or venue_name + date.',
    input_schema: {
      type: 'object',
      properties: {
        resy_token: {
          type: 'string',
          description: 'Resy reservation token (rr://...) from a prior booking or list_restaurant_reservations',
        },
        venue_name: {
          type: 'string',
          description: 'Restaurant name to match, e.g. "Bondi Sushi"',
        },
        date: {
          type: 'string',
          description: 'Reservation date YYYY-MM-DD to disambiguate',
        },
      },
      required: [],
    },
  },
  {
    name: 'link_auth_status',
    description:
      'Check whether the user has connected their Stripe Link wallet to Remi. Call before link_connect or when the user says they finished Link approval. Set poll_until_authenticated when the user just approved Link and you need to wait for auth to complete.',
    input_schema: {
      type: 'object',
      properties: {
        poll_until_authenticated: {
          type: 'boolean',
          description:
            'If true, poll auth status for up to ~1 minute until authenticated. Use after the user confirms they approved Link.',
        },
        max_attempts: {
          type: 'number',
          description: 'Poll attempts when poll_until_authenticated is true. Defaults to 12 (~60s).',
        },
      },
      required: [],
    },
  },
  {
    name: 'link_connect',
    description:
      'Start connecting the user\'s Stripe Link wallet. Returns a verification URL and phrase they must approve in the Link app. Tell them to open the URL, approve, then text back when done — then call link_auth_status.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'link_payment_methods_list',
    description:
      'List payment methods in the user\'s connected Stripe Link wallet. Requires link_connect first. Use when preparing a Link purchase or when the user asks which cards are on Link.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'link_shipping_address_list',
    description:
      'List saved shipping addresses in the user\'s Stripe Link wallet. Requires link_connect first.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];
