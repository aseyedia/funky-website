# Dancer AI dialogue — design spec

Status: approved by user 2026-07-08. Ready for implementation planning.

## Summary

Extend the existing 5.1 "canned affirmations" feature (click a background
dancer → talk animation + speech bubble) so the line can be AI-generated
and AI-voiced instead of always coming from a hardcoded array. Add a hover
glow so dancers read as clickable, and a camera dolly-in so a triggered
line feels like a real moment instead of a stationary bubble popping up
somewhere in the world.

This is explicitly the "modest" version of ROADMAP.md's 5.2 (AI chat with
the dancers) — no free-text input, no conversation history, no chat UI.
The only user input is a click. That constraint is what keeps the guardrail
surface small.

## Background / prior art

- 5.1 (already shipped) added: raycast click-to-talk, `talking.glb` gesture
  animation, a `.dancer-bubble` HTML overlay positioned via
  `Vector3.project()`, and a hardcoded `AFFIRMATIONS` array in
  `src/main.js`.
- 1.5 (already shipped) added a camera ease-to-target pattern (`homing`
  state machine in `animate()`, `startHoming()`) for the "return home" (H
  key) feature. The camera dolly-in reuses this exact pattern.
- ROADMAP.md 5.2 and 7.2 already specify the security posture this design
  inherits: key never reaches the browser, no user data in prompts, a
  sanctioned one-route exception to editing `~/professional-site`,
  fallback that degrades to the existing canned experience rather than
  breaking.

## Verified externals (not guessed — tested live during brainstorming)

- OpenRouter text model: `meta-llama/llama-3.1-8b-instruct`. Free-tier
  models (`:free` suffix) were tried first and are upstream-rate-limited
  in practice — rejected for reliability. This paid model costs
  ~$0.0000017/call in a live test (61 prompt + 17 completion tokens).
  Negligible even at the daily cap.
- ElevenLabs: key confirmed working (`user_read` permission was fixed
  mid-brainstorm), account is `payg` tier. Voice: `TX3LPaxmHKxFdv7VOQHJ`
  ("Liam — Energetic, confident", American, young male). Model:
  `eleven_flash_v2_5` (cheapest/lowest-latency tier). Both tested live
  with a real synthesis call (79,874-byte mp3 returned for a ~90-char
  line).
- `~/professional-site` currently has no `.env` and no `dotenv`
  dependency — both need adding. It runs via a system-level systemd unit
  (`/etc/systemd/system/professional-site.service`); this session has
  passwordless `sudo systemctl restart professional-site`.

## Architecture

```
Browser (funky-website)                    Server (professional-site)
┌─────────────────────────┐                ┌──────────────────────────┐
│ click dancer             │                │ POST /funky/api/         │
│  → hover glow (existing) │   fetch (POST) │      dancer-line         │
│  → talk anim starts      │───────────────>│  1. daily cap check      │
│  → camera dollies in     │                │  2. OpenRouter call      │
│  → cooldown check        │<───────────────│  3. ElevenLabs call      │
│      (localStorage)      │  { text,       │     (if VOICE_ENABLED)   │
│  → bubble + audio        │    audio? }    │  4. return text (+audio) │
│  → camera returns         │                └──────────────────────────┘
│  → cooldown-blocked or            
│    fetch failed/timeout
│    → canned fallback
│    (existing 5.1 path,
│     unchanged mechanics,
│     new warm-tone lines)
└─────────────────────────┘
```

Two independent failure-safe layers:
1. **Client cooldown** (localStorage, 45s, shared across all 3 dancers) —
   skips the network call entirely most of the time. Zero cost, zero
   latency, exact existing 5.1 behavior.
2. **Server daily cap** (in-memory counter, resets at UTC midnight, 200/
   day) — hard backstop if cooldown is bypassed (cleared storage,
   multiple tabs, etc.).

Every failure mode (cooldown active, daily cap hit, OpenRouter down,
ElevenLabs down, 6s timeout) converges on the same fallback: canned line,
fixed-duration talk animation, no audio. The site can never look broken —
worst case it silently behaves exactly like the already-shipped 5.1
feature.

## Components

### Server: `~/professional-site/app.js` (sanctioned exception)

- Add `dotenv` dependency, `import 'dotenv/config'` at the top.
- New `~/professional-site/.env` (gitignored — add `.env` to
  `.gitignore`, which doesn't currently list it):
  ```
  OPENROUTER_API_KEY=...       (copy from ~/media-center/.env)
  ELEVENLABS_API_KEY=...
  VOICE_ENABLED=true
  ```
- New route `POST /funky/api/dancer-line`:
  - No request body needed (no user input).
  - In-memory `{ count, dayKey }` state; `dayKey` = current UTC date
    string. If `dayKey` has rolled over, reset `count`. If `count >= 200`,
    respond `429 { error: 'daily cap reached' }` immediately, no API
    calls made.
  - Otherwise increment count, call OpenRouter chat completions with the
    system prompt below, `max_tokens: 60`, `temperature: 0.9`.
  - On OpenRouter failure: respond `502 { error: '...' }`.
  - On success, if `process.env.VOICE_ENABLED === 'true'`: call
    ElevenLabs TTS with the returned text. On ElevenLabs failure, still
    respond `200` with `{ text, audio: null }` — text-only degrade,
    don't fail the whole request over a voice hiccup.
  - On full success: `200 { text, audio: <base64 mp3 or null> }`.
  - System prompt (text tone — see "Tone" section below for the full
    affirmation voice this must match):
    > "You are a friendly street dancer at a small personal portfolio
    > website. Offer the visitor one short, warm, sincere, and touching
    > thought about life, kindness, or being human — heartfelt and
    > universal, never hype, never about code or technology. Two
    > sentences maximum. Never claim to be the site's owner or to know
    > the visitor personally; if asked something personal, gently
    > deflect in character (e.g. 'I just dance here, but I'm glad you're
    > here')."

### Client: `src/main.js` (extends existing 5.1 code, doesn't replace it)

**Tone — replace `AFFIRMATIONS` array wholesale.** Twenty lines, warm/
universal/non-technical, including the user's three examples verbatim:

1. "You are incredible. Thank you so much for visiting."
2. "Keep it up. You are doing so well."
3. "The people in your life are fortunate to have you."
4. "You carry more light than you know."
5. "Whatever you're working through, you're doing better than you think."
6. "Someone out there is grateful you exist."
7. "You've survived every hard day so far. That's no small thing."
8. "Be gentle with yourself today. You deserve that."
9. "The world is a little better because you're in it."
10. "You don't have to have it all figured out to be enough."
11. "Someone, somewhere, is smiling because they know you."
12. "Your kindness matters more than you realize."
13. "You are allowed to rest. You are allowed to be proud of yourself."
14. "Thank you for showing up, today and every day."
15. "You are worthy of the love you give so freely to others."
16. "This moment is a gift, and so are you."
17. "You've made it this far. Keep going, gently."
18. "Someone believes in you, even on the days you don't believe in yourself."
19. "You are exactly where you need to be."
20. "Take a breath. You are safe, and you are loved."

**Hover glow.**
- `mousemove` listener on `renderer.domElement` (guarded by
  `flight.enabled`, matching the existing click guard). Raycast against
  the 3 dancers every move event (cheap at this scale, no throttling
  needed).
- Fix required first: `SkeletonUtils.clone()` shares material instances
  across clones by default. Currently all 3 dancers reference the same
  `Ch32_body` material object. At dancer-creation time (in
  `enableDancer`'s fbx-loaded callback), clone the mesh's material so
  each dancer is independently mutable:
  `mesh.material = mesh.material.clone();`
- On hover enter: `material.emissive.setHex(0xffdd55);
  material.emissiveIntensity = 0.6;` (MeshStandardMaterial from GLTFLoader
  supports both). On hover exit: reset to `0x000000` / `0`.
  `renderer.domElement.style.cursor` toggles `pointer`/`auto` to match.

**Camera dolly-in.** New small state machine in `animate()`, modeled
directly on the existing `homing` pattern (1.5):
- Triggered on every accepted click (AI path or canned fallback — the
  camera doesn't care which produced the line), not gated by the AI
  cooldown.
- On trigger: save `camera.position` and `controls.target`; disable
  `controls.enabled`; ease camera position over ~1.2s toward a point
  offset from the dancer's head bone along the vector from head to the
  *current* camera position (approaches from whatever angle the visitor
  is already viewing from, so it never pops to the opposite side of the
  dancer or clips through the model), while easing the look direction
  toward the head bone.
- Hold phase: camera continues `lookAt`-tracking the head bone every
  frame (small idle animation motion reads as "watching them talk").
  Ends when `dancer.talking` flips back to `false` (the exact existing
  5.1/AI-path signal that speech has finished) **or** an 8s hard cap
  elapses — whichever comes first. The hard cap exists purely so the
  camera can never get stuck if an animation-end event fails to fire.
- Return phase: ease back to the saved position/target over ~1.2s, then
  `controls.enabled = true`.
- Only one dolly at a time — a click on a second dancer while one is
  already focused is ignored (matches the existing "ignore clicks while
  talking" rule per-dancer, extended to be global for the camera).
- Flight mode is already excluded upstream (dancer clicks are ignored
  while flying, per 5.1) so this state machine only ever runs in orbit
  mode — no interaction with `FlightControls` needed.

**Talk-animation duration, extended from 5.1's fixed 2-loop count:**
- AI path with audio: `action.setLoop(THREE.LoopRepeat, Infinity)`;
  create an `Audio` element from the base64 mp3, play it; on the audio's
  `ended` event, run the same finalize step 5.1 already uses
  (`dancer.talking = false; playDancerNextAnimation(dancer);`), which
  also signals the camera dolly to return.
- AI path, voice disabled or ElevenLabs failed mid-request (still
  `200 { text, audio: null }`): same infinite loop, but end via a
  reading-time estimate (`Math.max(3, wordCount * 0.35)` seconds) instead
  of an audio event.
- Cooldown-blocked or fetch failed/timed out: **exact existing 5.1
  behavior**, untouched — `setLoop(THREE.LoopRepeat, 2)`, ends via the
  mixer's `finished` event, canned line, 4s bubble.
- Music ducks while dancer audio plays, using the existing per-frame
  `sound.setVolume()` stepping already in `animate()` — no new
  `AudioParam` ramps (per the d7cb8db lesson already documented in
  ROADMAP.md).

**Cooldown + request flow:**
- `localStorage['funky_ai_line_cooldown']` timestamp, 45s window, shared
  across all 3 dancers.
- On click (dancer not already talking): start talk animation + camera
  dolly immediately regardless of cooldown state (feels responsive).
  - Cooldown clear: `fetch('/funky/api/dancer-line', { signal:
    AbortSignal.timeout(6000) })`. On success, show bubble with the
    returned text once it arrives (brief beat of silent talking before
    the line appears, which reads naturally), play audio if present, set
    the cooldown timestamp. On any failure/timeout, fall through to the
    canned/fixed-loop path exactly as if cooldown had been active.
  - Cooldown active: skip the fetch, go straight to canned/fixed-loop
    path (current 5.1 mechanics, new tone).

## Error handling summary

| Failure | Behavior |
|---|---|
| Daily cap hit | Server returns 429 before calling either API. Client falls back to canned. |
| OpenRouter down/errors | Server returns 502. Client falls back to canned. |
| ElevenLabs down/errors | Server still returns 200 with `audio: null` — text-only AI line, reading-time-based animation end. |
| Client fetch timeout (6s) | Client aborts, falls back to canned. |
| Client cooldown active | No network call at all — canned path, zero cost. |
| Camera dolly animation-end signal never fires | 8s hard cap forces return regardless. |
| Second dancer clicked mid-dolly | Ignored — one focus at a time. |

## Explicitly out of scope (modest version)

- No free-text chat input, no conversation history.
- No per-IP server-side rate limiting (user's explicit choice — cooldown
  + daily cap only).
- No audio caching by text hash (lines are freshly generated each time,
  a hash cache wouldn't help hit rate).
- No lip-sync — dancers use the existing `talking.glb` body gesture only,
  same as 5.1.
- Monthly spend caps on the OpenRouter/ElevenLabs dashboards are the
  user's responsibility to set (per ROADMAP.md 5.2/7.2's own guardrail
  list) — not something this code can enforce.

## Testing / verification plan

- Headless (Playwright + swiftshader) can verify: no console errors, the
  route returns well-formed JSON, cooldown logic, daily-cap logic,
  material-clone fix (each dancer's emissive is independent), camera
  state-machine transitions (position values, controls.enabled toggling).
- Cannot reliably verify headless: whether the hover glow is visually
  legible, whether the camera framing actually centers the face well, and
  audio playback/lip-adjacent timing feel. These need a live human check,
  same pattern as 1.2/1.3/2.1/2.2/2.3 this session.
- Server route can be curl-tested directly against the live port before
  any browser involvement.
