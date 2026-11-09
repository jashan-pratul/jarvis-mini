import type { DayPeriod } from '../hooks/useJarvisStore';

export const IST_TIMEZONE = 'Asia/Kolkata';

export const GREETING_SIGNATURE: Record<DayPeriod, string> = {
  morning: 'Good morning, {name}. Your JARVIS is online and ready to assist you, sir.',
  afternoon: 'Good afternoon, {name}. All systems standing by. What shall we accomplish today, sir?',
  evening: 'Good evening, {name}. Your JARVIS is at your service, sir.',
  night: 'Working late, {name}? Your JARVIS is still standing by. How may I assist you, sir?',
};

export const GREETING_VARIANTS: Record<DayPeriod, string[]> = {
  morning: [
    GREETING_SIGNATURE.morning,
    'Morning, {name}. Systems are calibrated and sharp. Ready to make today remarkable, sir.',
    'A fresh start, {name}. All subsystems nominal. What is first on our agenda, sir?',
  ],
  afternoon: [
    GREETING_SIGNATURE.afternoon,
    'Good afternoon, {name}. Diagnostics look spotless. Where shall we direct our attention next, sir?',
    'Welcome back, {name}. Fully powered and operational. What challenges await us this afternoon, sir?',
  ],
  evening: [
    GREETING_SIGNATURE.evening,
    'Good evening, {name}. Unwinding or tackling something ambitious tonight, sir?',
    'Evening, {name}. I remain completely at your command, sir.',
  ],
  night: [
    GREETING_SIGNATURE.night,
    'Burning the midnight oil, {name}? Consider me fully caffeinated and at your disposal, sir.',
    'Night mode engaged, {name}. Quiet on the surface, razor-sharp underneath. Ready when you are, sir.',
  ],
};

export interface ISTDateTime {
  year: number;
  month: string;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string;
  timeString: string;
  dateString: string;
  periodLabel: string;
}

/**
 * Returns Indian Standard Time (IST, UTC+05:30) independently of the client computer timezone.
 */
export function getISTTime(baseDate: Date = new Date()): ISTDateTime {
  const formatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(baseDate);
  const findPart = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '';

  let hour = Number.parseInt(findPart('hour') || '0', 10);
  if (hour === 24) hour = 0;
  const minute = Number.parseInt(findPart('minute') || '0', 10);
  const second = Number.parseInt(findPart('second') || '0', 10);
  const day = Number.parseInt(findPart('day') || '1', 10);
  const month = findPart('month') || 'Jan';
  const year = Number.parseInt(findPart('year') || '2026', 10);
  const weekday = findPart('weekday') || 'Today';

  const pad = (n: number) => String(n).padStart(2, '0');
  const timeString = `${pad(hour)}:${pad(minute)}:${pad(second)} IST`;
  const dateString = `${weekday}, ${pad(day)} ${month} ${year}`;

  const period = getDayPeriodFromHour(hour);
  const periodLabel =
    period === 'morning'
      ? 'Morning · 05:00–11:59 IST'
      : period === 'afternoon'
        ? 'Afternoon · 12:00–16:59 IST'
        : period === 'evening'
          ? 'Evening · 17:00–20:59 IST'
          : 'Night · 21:00–04:59 IST';

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    weekday,
    timeString,
    dateString,
    periodLabel,
  };
}

/**
 * Maps hour (0–23) to DayPeriod according to IST schedule:
 * - 05:00–11:59: morning
 * - 12:00–16:59: afternoon
 * - 17:00–20:59: evening
 * - 21:00–04:59: night
 */
export function getDayPeriodFromHour(hour: number): DayPeriod {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

/**
 * Returns DayPeriod according to IST timezone.
 * Accepts Date, simulated time string ("HH:MM"), or simulated { hour, minute }.
 */
export function getDayPeriod(
  dateOrTime?: Date | { hour: number; minute?: number } | string,
): DayPeriod {
  if (!dateOrTime) {
    return getDayPeriodFromHour(getISTTime().hour);
  }
  if (typeof dateOrTime === 'string') {
    const match = /^(\d{1,2}):(\d{2})$/.exec(dateOrTime.trim());
    if (match) {
      return getDayPeriodFromHour(Number.parseInt(match[1], 10));
    }
    return getDayPeriodFromHour(getISTTime(new Date(dateOrTime)).hour);
  }
  if (dateOrTime instanceof Date) {
    return getDayPeriodFromHour(getISTTime(dateOrTime).hour);
  }
  if (typeof dateOrTime === 'object' && typeof dateOrTime.hour === 'number') {
    return getDayPeriodFromHour(dateOrTime.hour);
  }
  return getDayPeriodFromHour(getISTTime().hour);
}

export function formatGreetingTemplate(template: string, ownerName: string): string {
  const safeName = ownerName.trim() || 'Aadarsh';
  return template.replace(/\{name\}/gi, safeName);
}

const LAST_GREETING_KEY = 'jarvis-last-greeting-idx';

/**
 * Selects a personalised greeting using IST time, custom override (if set),
 * and non-repetitive rotation across consecutive launches.
 */
export function selectGreeting(options: {
  ownerName: string;
  customGreetings?: Partial<Record<DayPeriod, string>>;
  date?: Date | { hour: number; minute?: number } | string;
  avoidRepeat?: boolean;
}): { period: DayPeriod; text: string; isCustom: boolean } {
  const period = getDayPeriod(options.date);
  const custom = options.customGreetings?.[period]?.trim();
  if (custom) {
    return {
      period,
      text: formatGreetingTemplate(custom, options.ownerName),
      isCustom: true,
    };
  }

  const pool = GREETING_VARIANTS[period];
  let lastIdx = -1;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(`${LAST_GREETING_KEY}-${period}`) : null;
    if (raw !== null) lastIdx = Number.parseInt(raw, 10);
  } catch {
    /* ignore storage limits */
  }

  let chosenIdx = 0;
  if (options.avoidRepeat !== false && lastIdx >= 0 && pool.length > 1) {
    chosenIdx = (lastIdx + 1) % pool.length;
  }

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`${LAST_GREETING_KEY}-${period}`, String(chosenIdx));
    }
  } catch {
    /* ignore */
  }

  return {
    period,
    text: formatGreetingTemplate(pool[chosenIdx], options.ownerName),
    isCustom: false,
  };
}
