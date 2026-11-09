import type { ChatAction, View } from '../hooks/useJarvisStore';
import type { SecretCommandItem } from '../services/api';
import { tryEvaluateMath } from './mathEval';

export type CommandEffect =
  | { type: 'none' }
  | { type: 'navigate'; view: View }
  | { type: 'open_url'; label: string; url: string }
  | { type: 'create_note'; content: string }
  | { type: 'save_memory_prompt'; content: string }
  | { type: 'mute'; muted: boolean }
  | { type: 'stop_speaking' }
  | { type: 'clear_chat' }
  | { type: 'open_share' };

export interface CommandResult {
  handled: true;
  reply: string;
  action?: ChatAction;
  effect: CommandEffect;
}

const KNOWN_SITES: Record<string, { label: string; url: string }> = {
  youtube: { label: 'Open YouTube', url: 'https://www.youtube.com' },
  google: { label: 'Open Google', url: 'https://www.google.com' },
  github: { label: 'Open GitHub', url: 'https://github.com' },
  wikipedia: { label: 'Open Wikipedia', url: 'https://www.wikipedia.org' },
  gmail: { label: 'Open Gmail', url: 'https://mail.google.com' },
  maps: { label: 'Open Google Maps', url: 'https://maps.google.com' },
  'google maps': { label: 'Open Google Maps', url: 'https://maps.google.com' },
  whatsapp: { label: 'Open WhatsApp Web', url: 'https://web.whatsapp.com' },
  spotify: { label: 'Open Spotify', url: 'https://open.spotify.com' },
  stackoverflow: { label: 'Open Stack Overflow', url: 'https://stackoverflow.com' },
  'stack overflow': { label: 'Open Stack Overflow', url: 'https://stackoverflow.com' },
  leetcode: { label: 'Open LeetCode', url: 'https://leetcode.com' },
};

const JOKES = [
  'Why do programmers always mix up Halloween and Christmas? Because Oct 31 equals Dec 25.',
  'A photon checks into a hotel. The receptionist asks if it needs any help with its luggage. The photon replies, "No thank you, I am travelling light."',
  'There are 10 kinds of people in the world: those who understand binary, and those who do not.',
  'I would tell you a UDP joke, Aadarsh, but I am not entirely sure you would get it.',
  'A SQL query walks into a restaurant, approaches two tables and asks, "May I join you?"',
];

const MIND_BLOWING_FACTS = [
  '**Neutron star density:** A single teaspoon of neutron-star matter would weigh roughly **4 billion tonnes** on Earth — comparable to the mass of Mount Everest compressed into a sugar cube.',
  '**More trees than stars:** Earth has roughly **3 trillion trees**, whereas the Milky Way galaxy contains between **100 billion and 400 billion stars**.',
  '**Time dilation works on your head and feet:** Because of Einstein’s General Relativity, time ticks slightly faster at your head than at your feet due to the tiny difference in Earth’s gravitational pull.',
  '**Your atoms are ancient stardust:** Almost every heavy atom in your body — the iron in your blood, the calcium in your bones — was forged inside the core of a dying star billions of years ago.',
];

const UNBELIEVABLE_EXPLANATIONS = [
  '### Gravitational Time Dilation Near a Black Hole\nAccording to Einstein’s **General Theory of Relativity**, massive objects curve spacetime itself. If you hovered just outside the event horizon of a supermassive black hole like **Gargantua**, an hour on your wristwatch could correspond to **years passing on Earth**. You would not feel your own clock slowing down — to you, everything looks normal, while the universe outside plays in fast-forward.',
  '### Quantum Entanglement ("Spooky Action at a Distance")\nWhen two particles become **quantum-entangled**, measuring the quantum state of one instantaneously determines the state of its partner — even if the second particle is on the opposite side of the galaxy. In 2022, the Nobel Prize in Physics was awarded for experiments proving that these correlations cannot be explained by any hidden local variables.',
  '### Immortal Jellyfish (*Turritopsis dohrnii*)\nWhile almost every living organism ages in one direction, the tiny jellyfish *Turritopsis dohrnii* can reverse its life cycle when stressed or injured, transforming its adult cells back into a juvenile polyp stage — effectively resetting its biological clock.',
];

const SURPRISES = [
  'Surprise protocol engaged! Did you know Apollo 11’s guidance computer had **4 KB of RAM** and ran at **0.043 MHz** — yet your Samsung Galaxy A16 is millions of times more powerful than the computer that landed humans on the Moon?',
  'Here is a quick brain teaser for the room: *I speak without a mouth and hear without ears. I have no body, but I come alive with wind.* What am I? (**An echo!**)',
  'Fun status report: If you folded a standard sheet of paper **42 times**, the stack would be thick enough to reach from **Earth to the Moon** ($2^{42} \\times 0.1\\text{ mm} \\approx 439{,}804\\text{ km}$).',
];

let rotationIdx = 0;
function pickRotating(list: string[]): string {
  const item = list[rotationIdx % list.length];
  rotationIdx += 1;
  return item;
}

function stripAddressing(input: string): string {
  return input
    .trim()
    .replace(/^(hey\s+|hi\s+|hello\s+|ok\s+|okay\s+)?jarvis[\s,.:!-]*/i, '')
    .replace(/[.!?]+$/g, '')
    .trim();
}

/**
 * Evaluates whether the user's utterance is a deterministic local/system/secret command.
 * Returns `null` when the query should be sent to the Gemini AI brain instead.
 */
export function parseLocalCommand(
  rawInput: string,
  options: {
    ownerName?: string;
    customSecrets?: SecretCommandItem[];
  } = {},
): CommandResult | null {
  const owner = options.ownerName?.trim() || 'Aadarsh';
  const cleaned = stripAddressing(rawInput);
  const lower = cleaned.toLowerCase();
  if (!lower) return null;

  // 1. Custom user-defined secret commands from SQLite
  if (options.customSecrets?.length) {
    const match = options.customSecrets.find((s) => {
      const trig = stripAddressing(s.trigger).toLowerCase();
      return trig.length > 0 && (lower === trig || rawInput.trim().toLowerCase() === s.trigger.toLowerCase());
    });
    if (match) {
      return {
        handled: true,
        reply: match.response.replace(/\{name\}/gi, owner),
        effect: { type: 'none' },
      };
    }
  }

  // 2. Built-in Secret & Personality Commands (Section 13)
  if (/^(who'?s|who\s+is)\s+the\s+boss\b|^who\s+created\s+you\b|^who\s+is\s+your\s+owner\b/i.test(lower)) {
    return {
      handled: true,
      reply: `That would be ${owner}, obviously. I simply handle the intelligence around here.`,
      effect: { type: 'none' },
    };
  }

  if (/^who\s+are\s+you\b|^introduce\s+yourself\b|^what\s+is\s+your\s+name\b/i.test(lower)) {
    return {
      handled: true,
      reply: `I am JARVIS, ${owner}'s personal AI assistant — built for voice interaction, scientific & coding intelligence, live web research, and challenging ${owner}'s friends.`,
      effect: { type: 'none' },
    };
  }

  if (/^surprise\s+me\b/i.test(lower)) {
    return {
      handled: true,
      reply: pickRotating(SURPRISES),
      effect: { type: 'none' },
    };
  }

  if (/^(tell\s+(everyone|me|us)\s+a\s+joke|tell\s+a\s+joke|joke\s+please)\b/i.test(lower)) {
    return {
      handled: true,
      reply: pickRotating(JOKES),
      effect: { type: 'none' },
    };
  }

  if (/^(give\s+me\s+a\s+mind[- ]?blowing\s+fact|mind[- ]?blowing\s+fact|tell\s+me\s+a\s+fact)\b/i.test(lower)) {
    return {
      handled: true,
      reply: pickRotating(MIND_BLOWING_FACTS),
      effect: { type: 'none' },
    };
  }

  if (/^explain\s+something\s+unbelievable\b/i.test(lower)) {
    return {
      handled: true,
      reply: pickRotating(UNBELIEVABLE_EXPLANATIONS),
      effect: { type: 'none' },
    };
  }

  // 3. Mode & Navigation Commands
  if (
    /^(activate|start|open|launch|enter)\s+showcase(\s+mode)?\b|^showcase\s+mode\b/i.test(lower)
  ) {
    return {
      handled: true,
      reply: `Activating Showcase Mode right away, ${owner}.`,
      effect: { type: 'navigate', view: 'showcase' },
    };
  }

  if (
    /^(challenge\s+my\s+friends|quiz\s+everyone|start\s+a?\s*quiz|open\s+(friends\s+)?challenge|friends\s+challenge)\b/i.test(
      lower,
    )
  ) {
    return {
      handled: true,
      reply: 'Opening the Friends Challenge Arena. Hand the phone around and let us see who tops the leaderboard.',
      effect: { type: 'navigate', view: 'arena' },
    };
  }

  if (/^(open|show|check)\s+(diagnostics|system\s+status|system\s+diagnostics)\b|^diagnostics$/i.test(lower)) {
    return {
      handled: true,
      reply: 'Opening Live Device Diagnostics.',
      effect: { type: 'navigate', view: 'system' },
    };
  }

  if (/^(open|show)\s+(memory\s+vault|memories|notes|vault)\b/i.test(lower)) {
    return {
      handled: true,
      reply: 'Opening your Memory Vault.',
      effect: { type: 'navigate', view: 'vault' },
    };
  }

  if (/^(share\s+jarvis|open\s+share|show\s+qr\s+code)\b/i.test(lower)) {
    return {
      handled: true,
      reply: 'Opening the Share & QR invitation panel.',
      effect: { type: 'open_share' },
    };
  }

  // 4. Voice & Chat Controls
  if (/^(mute(\s+voice)?|be\s+quiet|silence)\b/i.test(lower)) {
    return {
      handled: true,
      reply: 'Voice output muted. You can unmute me anytime from the top bar.',
      effect: { type: 'mute', muted: true },
    };
  }

  if (/^unmute(\s+voice)?\b|^speak\s+aloud\b/i.test(lower)) {
    return {
      handled: true,
      reply: `Voice output restored, ${owner}.`,
      effect: { type: 'mute', muted: false },
    };
  }

  if (/^(stop(\s+speaking|\s+talking)?|cancel\s+speech)\b/i.test(lower)) {
    return {
      handled: true,
      reply: 'Stopped speaking.',
      effect: { type: 'stop_speaking' },
    };
  }

  if (/^clear\s+(chat|conversation|history)\b/i.test(lower)) {
    return {
      handled: true,
      reply: 'Conversation history cleared.',
      effect: { type: 'clear_chat' },
    };
  }

  // 5. Local Time & Date
  if (
    /^(what\s+time\s+is\s+it|what'?s\s+the\s+time|current\s+time|tell\s+me\s+the\s+time)\b/i.test(lower)
  ) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = now.toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return {
      handled: true,
      reply: `It is **${timeStr}** on **${dateStr}**, ${owner}.`,
      effect: { type: 'none' },
    };
  }

  if (/^(what\s+is\s+today'?s\s+date|what\s+date\s+is\s+it|what\s+day\s+is\s+(it|today))\b/i.test(lower)) {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return {
      handled: true,
      reply: `Today is **${dateStr}**, ${owner}.`,
      effect: { type: 'none' },
    };
  }

  // 6. Open Website / App Commands ("JARVIS, open YouTube", "JARVIS, open github.com")
  const openMatch = /^open\s+(.+)$/i.exec(cleaned);
  if (openMatch) {
    const targetRaw = openMatch[1].trim().replace(/^the\s+/i, '');
    const key = targetRaw.toLowerCase();
    if (KNOWN_SITES[key]) {
      const site = KNOWN_SITES[key];
      return {
        handled: true,
        reply: `Opening **${targetRaw}** for you, ${owner}.`,
        action: site,
        effect: { type: 'open_url', label: site.label, url: site.url },
      };
    }
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(targetRaw)) {
      const url = /^https?:\/\//i.test(targetRaw) ? targetRaw : `https://${targetRaw}`;
      const label = `Open ${targetRaw}`;
      return {
        handled: true,
        reply: `Opening **${targetRaw}**, ${owner}.`,
        action: { label, url },
        effect: { type: 'open_url', label, url },
      };
    }
  }

  // 7. Explicit Web / YouTube Search ("JARVIS, search for artificial intelligence")
  const ytSearch = /^search\s+youtube\s+for\s+(.+)$/i.exec(cleaned);
  if (ytSearch) {
    const query = ytSearch[1].trim();
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const action = { label: `YouTube: "${query}"`, url };
    return {
      handled: true,
      reply: `Searching YouTube for **${query}**, ${owner}.`,
      action,
      effect: { type: 'open_url', label: action.label, url },
    };
  }

  const googleSearch = /^(?:search(?:\s+google)?\s+for|google)\s+(.+)$/i.exec(cleaned);
  if (googleSearch) {
    const query = googleSearch[1].trim();
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    const action = { label: `Google: "${query}"`, url };
    return {
      handled: true,
      reply: `Opening Google search results for **${query}**, ${owner}.`,
      action,
      effect: { type: 'open_url', label: action.label, url },
    };
  }

  // 8. Notes ("JARVIS, create a note: buy batteries" or "JARVIS, create a note")
  const noteWithBody = /^(?:create\s+a\s+note|add\s+a\s+note|take\s+a\s+note|note)\s*(?::|-|that)?\s*(.+)$/i.exec(
    cleaned,
  );
  if (noteWithBody && !/^create\s+a\s+note$/i.test(cleaned)) {
    const content = noteWithBody[1].trim();
    if (content) {
      return {
        handled: true,
        reply: `Saving note to your Vault: *"${content}"*`,
        effect: { type: 'create_note', content },
      };
    }
  }
  if (/^(create|add|take|new)\s+a?\s*note$/i.test(lower)) {
    return {
      handled: true,
      reply: `Opening your Notes Vault so you can jot that down, ${owner}.`,
      effect: { type: 'navigate', view: 'vault' },
    };
  }

  // 9. Personal Memory with Consent ("JARVIS, remember that I love astrophysics")
  const rememberMatch = /^remember(?:\s+that)?\s+(.+)$/i.exec(cleaned);
  if (rememberMatch) {
    const content = rememberMatch[1].trim();
    if (content) {
      return {
        handled: true,
        reply: `Before I store personal information in your Memory Vault, please confirm below that you want me to remember: **"${content}"**`,
        effect: { type: 'save_memory_prompt', content },
      };
    }
  }

  // 10. Deterministic Mathematical Calculations ("JARVIS, calculate 987 multiplied by 654")
  const math = tryEvaluateMath(cleaned);
  if (math) {
    const stepBlock =
      math.steps.length > 1
        ? `\n\n**Step-by-step:**\n${math.steps.map((st, idx) => `${idx + 1}. \`${st}\``).join('\n')}`
        : '';
    return {
      handled: true,
      reply: `The result is **${math.formatted}**.${stepBlock}`,
      effect: { type: 'none' },
    };
  }

  return null;
}
