/** Infer meal/time-of-day from SMS and filter Resy slots to match. */

export type MealPeriod =
  | 'breakfast'
  | 'brunch'
  | 'lunch'
  | 'afternoon'
  | 'dinner'
  | 'night'
  | 'late_night';

export interface TimeWindow {
  /** Minutes from midnight, inclusive */
  startMinutes: number;
  /** Minutes from midnight, inclusive */
  endMinutes: number;
}

const MEAL_WINDOWS: Record<MealPeriod, TimeWindow> = {
  breakfast: { startMinutes: 7 * 60, endMinutes: 11 * 60 + 30 },
  brunch: { startMinutes: 9 * 60, endMinutes: 14 * 60 },
  lunch: { startMinutes: 11 * 60, endMinutes: 15 * 60 },
  afternoon: { startMinutes: 12 * 60, endMinutes: 17 * 60 },
  dinner: { startMinutes: 17 * 60, endMinutes: 23 * 60 + 59 },
  night: { startMinutes: 17 * 60, endMinutes: 23 * 60 + 59 },
  late_night: { startMinutes: 21 * 60, endMinutes: 23 * 60 + 59 },
};

export function mealPeriodWindow(period: MealPeriod): TimeWindow {
  return MEAL_WINDOWS[period];
}

export function mealPeriodLabel(period: MealPeriod): string {
  switch (period) {
    case 'breakfast':
      return 'breakfast';
    case 'brunch':
      return 'brunch';
    case 'lunch':
      return 'lunch';
    case 'afternoon':
      return 'afternoon';
    case 'dinner':
      return 'dinner';
    case 'night':
      return 'night';
    case 'late_night':
      return 'late night';
  }
}

export function parseMealPeriodFromText(text: string): MealPeriod | null {
  const t = text.toLowerCase();
  if (/\b(late night|after midnight)\b/.test(t)) return 'late_night';
  if (/\b(friday night|saturday night|sunday night|monday night|tuesday night|wednesday night|thursday night|tonight|at night|this night)\b/.test(t)) {
    return 'night';
  }
  if (/\b(night|dinner|evening|supper)\b/.test(t)) return 'night';
  if (/\b(brunch)\b/.test(t)) return 'brunch';
  if (/\b(lunch|midday|noon)\b/.test(t)) return 'lunch';
  if (/\b(breakfast|morning)\b/.test(t)) return 'breakfast';
  if (/\b(afternoon)\b/.test(t)) return 'afternoon';
  return null;
}

export function normalizeMealPeriod(value: unknown): MealPeriod | null {
  if (typeof value !== 'string') return null;
  const key = value.trim().toLowerCase().replace(/\s+/g, '_');
  const map: Record<string, MealPeriod> = {
    breakfast: 'breakfast',
    brunch: 'brunch',
    lunch: 'lunch',
    afternoon: 'afternoon',
    dinner: 'dinner',
    night: 'night',
    late_night: 'late_night',
    latenight: 'late_night',
    evening: 'night',
  };
  return map[key] ?? null;
}

/** Parse "3:00 PM", "7:00p", etc. to minutes from midnight. */
export function slotTimeToMinutes(timeStr: string): number | null {
  const raw = timeStr.trim();
  if (!raw) return null;

  const m12 = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m12) {
    let hour = Number.parseInt(m12[1]!, 10);
    const minute = Number.parseInt(m12[2]!, 10);
    const pm = m12[3]!.toUpperCase() === 'PM';
    if (pm && hour !== 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
    return hour * 60 + minute;
  }

  const compact = raw.match(/^(\d{1,2}):(\d{2})(a|p)$/i);
  if (compact) {
    let hour = Number.parseInt(compact[1]!, 10);
    const minute = Number.parseInt(compact[2]!, 10);
    if (compact[3]!.toLowerCase() === 'p' && hour !== 12) hour += 12;
    if (compact[3]!.toLowerCase() === 'a' && hour === 12) hour = 0;
    return hour * 60 + minute;
  }

  return null;
}

export function slotMatchesMealPeriod(timeStr: string, period: MealPeriod): boolean {
  const minutes = slotTimeToMinutes(timeStr);
  if (minutes == null) return true;
  const { startMinutes, endMinutes } = mealPeriodWindow(period);
  return minutes >= startMinutes && minutes <= endMinutes;
}

export function filterSlotsByMealPeriod<T extends { time: string }>(
  slots: T[],
  period: MealPeriod,
): T[] {
  return slots.filter((slot) => slotMatchesMealPeriod(slot.time, period));
}

export function filterVenuesByMealPeriod<T extends { slots: Array<{ time: string }> }>(
  venues: T[],
  period: MealPeriod,
): T[] {
  return venues
    .map((venue) => ({
      ...venue,
      slots: filterSlotsByMealPeriod(venue.slots, period),
    }))
    .filter((venue) => venue.slots.length > 0);
}
