# Aadarsh's JARVIS — Ultimate Pocket AI Assistant (Showstopper Edition)

> **"I am JARVIS, Aadarsh's personal AI assistant."**

**Aadarsh's JARVIS** is a full-stack, voice-driven Progressive Web App (PWA) personal AI assistant built specifically for **Aadarsh** and optimised for the **Samsung Galaxy A16** (Android Chrome, ~393×873 viewport, Mali-G57 GPU) as well as tablets, laptops and desktop browsers.

---

## Key Features

1. **Cinematic Boot Sequence (`src/components/BootSequence/`)**
   - Touch-to-initialise audio/speech unlock gate (required by Android Chrome autoplay policy).
   - Genuine readiness verification across 7 subsystems (`/api/health` neural link, Gemini cognition core, SQLite memory core, WebGL 2 holographic renderer, speech synthesis voices, Web Speech recognition, and device sensors).
   - Skip Intro and Sound FX toggle.

2. **Personalised Greeting System (`src/utils/greetings.ts`)**
   - Time-aware spoken and displayed greetings using the device's local clock (`morning`, `afternoon`, `evening`, `night`) with non-repetitive rotation and full customisation in Settings.

3. **3D Holographic AI Reactor (`src/components/Reactor/`)**
   - Built with Three.js & `@react-three/fiber`: central glowing energy sphere, geodesic wireframe lattice, counter-rotating gyroscopic gimbal rings, orbital particle field, light trails, expanding energy pulses, and a 64-segment sound-reactive circular waveform.
   - Five live states: `IDLE`, `LISTENING`, `THINKING`, `SPEAKING`, and `ERROR`.
   - Optimised for Mali-G57 (`dpr={[1, 1.5]}`, adaptive FPS monitor, automatic battery-saver switch below 20%, paused render loop when backgrounded or on non-reactor tabs, and instant 2D SVG fallback).

4. **Real Voice Assistant (`src/hooks/useSpeechRecognition.ts`, `src/hooks/useSpeechSynthesis.ts`)**
   - Push-to-talk Web Speech API recognition with live interim transcript bubble and optional real Web Audio microphone frequency analyser.
   - Natural SpeechSynthesis output with British-English voice ranking (`en-GB` preferred), word-boundary reactor sync, interrupt/stop button, mute toggle, and adjustable rate/pitch/volume.

5. **Advanced AI Brain & Live Web Intelligence (`server/services/geminiService.ts`)**
   - Server-side `@google/genai` SDK (`gemini-2.5-flash`) streaming over Server-Sent Events (`/api/chat`).
   - Google Search grounding (`googleSearch`) and URL Context (`urlContext`) with verified clickable source citations.

6. **Computer & Web Command Centre (`src/utils/commandParser.ts`, `src/utils/mathEval.ts`)**
   - Deterministic local handler for opening apps/websites (`YouTube`, `Google`, `GitHub`, `Wikipedia`, `Maps`, or any domain) with honest popup-blocker detection and tap-to-open buttons.
   - Safe recursive-descent mathematical evaluator (zero `eval`) supporting spoken expressions like `"JARVIS, calculate 987 multiplied by 654"`, percentages, powers, and square roots with step-by-step breakdowns.
   - Built-in secret commands (`"JARVIS, who's the boss?"`, `"surprise me"`, `"tell everyone a joke"`, `"give me a mind-blowing fact"`, `"explain something unbelievable"`) plus custom SQLite secret commands.

7. **AARADH'S JARVIS SHOWCASE MODE (`src/components/Showcase/ShowcaseView.tsx`)**
   - Theatrical showcase overlay with spoken introduction and 8 live interactive demonstrations (`01 Meet JARVIS`, `02 Mind-Blowing Science`, `03 Mathematical Intelligence` with local verification, `04 Coding Intelligence`, `05 Fun & Humour`, `06 Live Web Intelligence`, `07 Voice Challenge`, `08 Personality Mode`).

8. **Friends Challenge Arena (`src/components/FriendsChallenge/FriendsChallengeView.tsx`)**
   - Turn-by-turn pass-the-phone quiz across 6 categories (`Science Quiz`, `Mathematics`, `Coding Riddles`, `General Knowledge`, `Brain Teasers`, `Fun Mode`) and 3 difficulty levels.
   - Server-side answer validation so answers cannot be inspected in DevTools, offline-capable procedural Mental Maths mode, session leaderboard, and persistent SQLite Hall of Fame.

9. **Memory Vault & Live Device Diagnostics (`src/components/MemoryVault/`, `src/components/Diagnostics/`)**
   - Consent-gated personal memories, notes, and custom secret commands protected by `OWNER_PASSCODE`.
   - Honest device diagnostics (Battery Status API, Network Information API, local clock & uptime, microphone permission state, WebGL renderer & measured FPS, and backend round-trip latency — zero fabricated CPU/RAM sliders).

10. **Installable PWA & WhatsApp/QR Sharing (`public/manifest.json`, `public/sw.js`, `src/components/ShareModal/`)**
    - Standalone manifest, custom icons, service worker with app-shell caching and `/offline.html` fallback.
    - WhatsApp invitation deep link, native Android Web Share sheet, Copy URL, and live QR code generated from the real application origin.

---

## Quick Start (Local Development)

```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY from https://aistudio.google.com/apikey
# Optionally set OWNER_PASSCODE (min 6 characters)

# 3. Start backend + Vite dev server
npm run dev
```

- Development UI: `http://localhost:5173` (proxies `/api` to `http://localhost:8787`)
- Production build & single-server start:
  ```bash
  npm run build
  npm start
  ```
- Run unit & database tests:
  ```bash
  npm test
  ```
- Run Samsung Galaxy A16 headless Chrome audit:
  ```bash
  npm run e2e:a16
  ```

---

## Deployment Instructions

### Option A — Render (Blueprint)
1. Push this repository to GitHub.
2. In Render, click **New → Blueprint** and select the repository (`render.yaml` is pre-configured).
3. Enter your `GEMINI_API_KEY` and `OWNER_PASSCODE` (min 6 characters) when prompted.
4. Render provisions HTTPS automatically (required for Web Speech microphone access on Android).

### Option B — Railway / Fly.io / Docker
```bash
docker build -t aadarshs-jarvis .
docker run -p 8787:8787 \
  -e GEMINI_API_KEY="your_key" \
  -e OWNER_PASSCODE="your_secret_passcode" \
  aadarshs-jarvis
```

---

## Samsung Galaxy A16 Real-Device Testing Checklist

- [ ] **HTTPS Origin:** Open the deployed `https://...` URL in Chrome on the Samsung Galaxy A16 (Web Speech microphone requires HTTPS or `localhost`).
- [ ] **Boot & Audio Unlock:** Tap **Touch to initialise** and confirm the startup hum, subsystem verification list, 3D reactor ignition, and spoken time-of-day greeting for Aadarsh.
- [ ] **Install PWA:** Tap the Chrome menu (⋮) → **Install app** (or the top-bar download icon) and launch **Aadarsh's JARVIS** from the home screen in standalone full-screen mode.
- [ ] **Voice Assistant:** Tap the microphone button, grant microphone permission, say *"JARVIS, who's the boss?"* and *"JARVIS, calculate 987 multiplied by 654"*, and verify the spoken reply.
- [ ] **Showcase Mode:** Tap **Showcase** in the bottom navigation, listen to the introduction, and step through Demos 01–08 (including handing the phone to a friend on Demo 07).
- [ ] **Friends Challenge:** Tap **Arena**, enter friends' names, run a round, and confirm turn rotation and Hall of Fame leaderboard persistence.
- [ ] **WhatsApp & QR Share:** Tap the Share icon in the top bar, scan the QR code from a friend's phone, and test the **Share via WhatsApp** button.
