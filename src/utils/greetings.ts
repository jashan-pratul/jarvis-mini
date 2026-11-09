import type { DayPeriod } from '../hooks/useJarvisStore';

export const GREETING_SIGNATURE: Record<DayPeriod, string> = {
  morning: 'Good morning, {name}. Your personal AI assistant is online. Ready to make today productive, sir?',
  afternoon: 'Good afternoon, {name}. Lovely to have you back. What shall we accomplish today?',
  evening: 'Good evening, {name}. Your JARVIS is at your service, sir.',
  night: "Working late, {name}? I'm right here whenever you need me.",
};

const GREETING_VARIANTS: Record<DayPeriod, string[]> = {
  morning: [
    GREETING_SIGNATURE.morning,
    'Morning, {name}. Systems are calibrated and sharp. Shall we get ahead of the day, sir?',
    'A fresh start, {name}. All subsystems are nominal — what is first on the agenda?',
  ],
  afternoon: [
    GREETING_SIGNATURE.afternoon,
    'Good afternoon, {name}. Back in action, sir — point me at the next challenge.',
    'Welcome back, {name}. Afternoon diagnostics look spotless. How may I assist?',
  ],
  evening: [
    GREETING_SIGNATURE.evening,
    'Good evening, {name}. Unwinding or tackling something ambitious tonight, sir?',
    'Evening, {name}. Ready when you are — ask anything, anytime.',
  ],
  night: [
    GREETING_SIGNATURE.night,
    'Still awake, {name}? Night mode is engaged — quiet on the surface, sharp underneath.',
    'Late-night session, {name}? Consider me fully caffeinated and at your disposal.',
  ],
};

export function getDayPeriod(date: Date = new Date()): DayPeriod {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

export function formatGreetingTemplate(template: string, ownerName: string): string {
  const safeName = ownerName.trim() || 'Aadarsh';
  return template.replace(/\{name\}/gi, safeName);
}

const LAST_GREETING_KEY = 'jarvis-last-greeting-idx';

/**
 * Selects a personalised greeting using device local time, custom override (if set),
 * and non-repetitive rotation across consecutive launches.
 */
export function selectGreeting(options: {
  ownerName: string;
  customGreetings?: Partial<Record<DayPeriod, string>>;
  date?: Date;
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
    // Rotate through variants cleanly without repeating the immediately preceding greeting.
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
