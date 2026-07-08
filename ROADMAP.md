# funky-website Roadmap

Feature plan written 2026-07-06 (Claude Fable 5) for execution by later Claude
sessions (Opus / Sonnet). Each task is self-contained, ordered by
value-per-effort, and tagged with a recommended executor model. Do ONE task
per session, verify in the browser, commit, then stop.

---

## Architecture crash course (read this first, every session)

- **Stack**: vanilla three.js 0.165 + vite. No framework. `src/main.js` is the
  app; components in `src/components/` (assetLoader, clouds, flight, cube).
- **Deploy = `npm run build`.** Output lands in `dist/`, which is served LIVE
  at artaseyedian.com/funky/ by `~/professional-site/app.js` (Express, port
  3000, mounted at `/funky`). There is no staging. A build is a deploy.
- **After every build**: delete stale hashed bundles from `dist/assets/`
  (keep only the js file referenced by `dist/index.html` and the css).
  `ls` is aliased to eza on this box — use `command ls` in scripts.
- **Assets**: `src/public/` is the vite publicDir (copied verbatim into dist).
  HDRs are git-lfs tracked. 4k HDR masters + original FBX live in
  `/mnt/4TB_SSD/backups/funky-website/src-dist-masters-2026-07-05.tar`.
- **Dancer pipeline**: model `src/public/models/dancer.glb` (meshopt), 34
  animation clips in `src/public/models/anims/*.glb`. Loaded with GLTFLoader +
  MeshoptDecoder; dancers are SkeletonUtils.clone()s of one base scene,
  scale ×10 (glTF meters vs scene units). Conversion pipeline if ever needed
  again: npm packages `fbx2gltf` + `@gltf-transform/cli` (see git history).
- **Sky**: `scene.background` = raw 2k HDR equirect (sharp), `scene.environment`
  = same texture (renderer PMREMs internally). On HDRI switch the old texture
  is disposed (`currentSkyTexture` in main.js). Clouds: `components/clouds.js`,
  one instanced billboard draw + one FBM deck plane, per-HDRI presets in
  `CLOUD_PRESETS` keyed by hdr basename ('001'…'008', 'memorial').
- **Flight**: `components/flight.js`, PointerLockControls wrapper. F to enter,
  ESC exits, OrbitControls take over with pivot re-aimed 120 units ahead
  (must stay ≥ minDistance 90). W/E/R cube-gizmo keys are suppressed in flight.
- **Audio**: THREE.Audio + AudioAnalyser in main.js. `currentBass` (0..1) and
  transient `punch` already computed each frame — reuse them, don't add a
  second analyser. Volume fades are stepped via `sound.setVolume()` in the
  render loop — NEVER use AudioParam ramps near `context.resume()`
  (Chromium drops them; that bug already shipped once, commit d7cb8db).
- **Frame loop**: `animate()` throttles to 60fps; `dt` seconds available
  inside the throttle block. First frame has NaN deltaTime by design (skipped).
- **Perf budget**: integrated GPU target. pixelRatio capped (1.5 mobile /
  2 desktop). Adding > ~3 draw calls or any per-pixel raymarching needs a
  GUI quality toggle defaulting OFF.
- **Verification limits**: GLSL cannot be compile-checked headless — after any
  shader change, the human must load the page and check the console. Say so
  in your handoff message. `npm run build` only catches JS parse errors.
- **Style**: no comments narrating what code does; commit messages
  conventional (`feat:`/`fix:`), subject ≤ 50 chars, body explains why.
- **Do NOT**: add frameworks or deps without strong reason; touch
  `~/professional-site` except to read; commit `dist/` or `node_modules`;
  break mobile (no pointer lock there — feature-gate with `isMobile()`);
  push to GitHub unless the user asks.

---

## Phase 1 — quick wins (Sonnet-friendly, one session each)

### 1.1 Beat-synced dancer moves  — model: Sonnet — DONE
The scene already computes bass transients (`punch` in main.js). Make dancers
switch animations ON the beat instead of on a setTimeout.
- In `playDancerNextAnimation`, remove the setTimeout chain. Instead track
  `clipElapsed` per dancer; in `animate()`, when a dancer's current clip has
  played ≥ 70% of its duration AND `punch > 0.25` (a kick), advance to its
  next animation. Fallback: force-advance at 130% duration so silence never
  freezes a dancer mid-loop.
- Crossfade stays 0.5s (`fadeOut`/`fadeIn` already in place).
- Acceptance: with music playing, dancers visibly change moves on kicks;
  with music paused they still cycle (fallback path); no console warnings.

### 1.2 Fireworks on double-click  — model: Sonnet
Joy feature. Double-click anywhere (not in flight mode): firework launches
from the horizon toward the sky, explodes into ~300 points.
- New `src/components/fireworks.js`: one THREE.Points pool (~1500 verts,
  single BufferGeometry, additive blending, vertexColors). CPU-side particle
  sim in `update(dt)` — position += velocity, velocity.y -= gravity, life
  fades alpha via a `aLife` attribute consumed in a small ShaderMaterial.
  Rocket phase = 1 particle streaking up; explosion = spawn ring of particles
  at apex with random spherical velocities, color = random HSL hue.
- Optional: tiny synthesized "thump" via WebAudio oscillator + noise burst
  (no audio file). Skip if fiddly.
- Wire: `dblclick` listener (guard `flight.enabled` and `e.target` being the
  canvas), launch at a point 400–800 units away in the click direction.
- Acceptance: double-click spawns firework, 60fps holds with 3 simultaneous,
  particles fade fully (no immortal points), works with clouds on.

### 1.3 Seagulls (boids)  — model: Sonnet
Makes the world feel alive. ~24 birds circling the text monument.
- New `src/components/birds.js`. Each bird = 2 triangles (flapping wings via
  vertex shader `sin(uTime * flapSpeed + phase)` on wing verts) in ONE
  InstancedMesh; per-instance offset/heading updated CPU-side with classic
  boids (separation/alignment/cohesion) constrained to a torus around origin
  (radius 150–400, altitude 40–120).
- Boids at 24 agents = trivial CPU. Store per-instance matrices via
  `setMatrixAt` + `instanceMatrix.needsUpdate`.
- Silhouette color near-black, slight fog-fade with distance. No textures.
- Acceptance: birds flock plausibly (no clumping into one point, no fleeing
  to infinity — clamp speeds), visible from spawn viewpoint, +1 draw call.

### 1.4 Photo mode  — model: Sonnet — DONE
- Key P (and GUI button "Photo") hides all HUD (`.lil-gui`, info/tips
  containers, music button, stats) via a `photo-mode` body class + CSS,
  waits one frame, then `renderer.domElement.toBlob` → download
  `funky-<timestamp>.png`. IMPORTANT: WebGLRenderer needs
  `preserveDrawingBuffer: true` OR (better) render once synchronously right
  before toBlob — do the latter, don't change renderer flags.
- Acceptance: P downloads a clean PNG with no UI; UI returns after.

## Phase 2 — atmosphere (Sonnet for 2.1/2.2, Opus for 2.3)

### 2.1 Lens flare per HDRI  — model: Sonnet
- three addon `Lensflare` + `LensflareElement`, textures generated on canvas
  (radial gradients — same trick as clouds.js `makePuffTexture`).
- Add `sun: [x, y, z] | null` to each `CLOUD_PRESETS` entry (estimate sun
  direction per sky by eye; ask the human to fine-tune numbers live via a
  temporary GUI vec3). Attach flare to a light/object positioned far along
  that direction; presets without sun (storm, overcast, moon, memorial) = null.
- Acceptance: Day/Dusk/Pink Sunset show a flare that occludes behind the
  text mesh; no flare on sunless presets; HDRI switch swaps flare correctly.

### 2.2 Rain + lightning for Stormy  — model: Sonnet (rain) / Opus if shader trouble
- Rain: one THREE.Points field (~2000 streaks, cylinder around camera,
  y wraps mod height; vertex shader stretches points into streaks via
  gl_PointSize + a smear in the fragment). Follows camera like clouds tile.
- Lightning: every 6–14s (random), 2-frame white flash — bump
  `dirLight.intensity` ×8 and background exposure briefly, then thunder:
  filtered noise burst via WebAudio (no file) delayed 0.5–2s.
- Auto-activates only for preset '003' (Stormy), via the existing
  `applyPreset` pathway (add an `fx: 'rain'` field). GUI toggle to override.
- Acceptance: switching to Stormy starts rain within a second; leaving stops
  it; flash never strobes more than 2 frames; fps holds.

### 2.3 HDRI crossfade  — model: Opus
Currently sky switches are a hard pop. Blend old → new over ~1.5s.
- Cannot lerp `scene.background` directly. Approach: custom fullscreen
  background via a large inverted sphere (or THREE.Scene.backgroundBlurriness
  tricks won't help): shader samples BOTH equirect textures, mixes by uniform
  `uBlend`; while blending, `scene.background = null` and the sphere renders
  first (depthWrite off, renderOrder -1). After blend completes, set
  `scene.background = newTexture`, remove sphere, dispose old.
- `scene.environment` can just hard-swap at blend midpoint (reflection pop is
  barely noticeable; don't over-engineer).
- Tricky details: sphere must follow camera; tone mapping chunks in the
  shader (`#include <tonemapping_fragment>`, `<colorspace_fragment>`);
  equirect sampling function (three has `equirectUv` in shader chunks).
  This is the fiddliest shader task in the plan — hence Opus.
- Acceptance: HDRI dropdown changes melt smoothly; cloud tint still applies;
  no double-dispose crash when spamming the dropdown (guard concurrent blends).

## Phase 3 — the big one (Opus, possibly 2 sessions)

### 3.1 Portfolio islands — give flight a destination
Right now flying is aimless. Scatter 4–6 floating "project islands" in the
sky (600–1500 units out, altitude 200–500): each a small rock/platform with
a floating 3D title, holding a project card.
- Content source: hardcode a `PROJECTS` array in a new
  `src/components/islands.js` (title, blurb, url, accent color). Ask the
  human which projects; `~/professional-site/views/content/projects/*.md`
  has the list (read-only!).
- Island geometry: low-poly icosahedron rock (flat-shaded, vertex-displaced
  by hash noise) + TextGeometry title (font already loaded via AssetLoader)
  + a slowly rotating ring. Bob gently (sin). One draw call per island is fine.
- Interaction: raycast on click (both orbit + flight modes); within 250
  units, clicking opens the project URL in a new tab (`window.open`);
  farther away, clicking smoothly flies the camera toward it (lerp camera
  position over ~2s, disable controls during, hand back after). In flight
  mode show island name in the HUD hint when crosshair hovers it.
- A "compass" hint: small floating arrows or a GUI list "Projects" with
  fly-to buttons, so orbit-mode users discover them too.
- Acceptance: islands visible from spawn as distant silhouettes; fly-to
  works from both control modes; links open; nothing z-fights the clouds;
  mobile (orbit-only) can still tap islands listed in GUI.

## Phase 4 — polish / defense (Sonnet)

### 4.1 Adaptive quality — DONE
- Rolling 3s FPS average (reuse the throttle block). If < 40: drop
  pixelRatio one notch (min 1), halve cloud density, disable rain; if > 55
  for 10s, restore one notch. Log decisions once each (no spam). GUI
  "Quality: auto/high/low" dropdown to pin it.
- Acceptance: forcing chrome's software GL (or 6× CPU throttle) triggers a
  visible quality drop instead of a slideshow; recovery works.

### 4.2 Progress-real loading screen — DONE
- AssetLoader already owns a THREE.LoadingManager — wire
  `manager.onProgress` to the existing `#loadingBar` width so the bar
  reflects reality instead of instantly vanishing. Add the same funky yellow
  accent as the rest of the HUD. Show the first frame ASAP: HDRI + audio are
  already lazy; the bar mostly tracks font + waternormals (fast) — keep it
  honest but snappy.

### 4.3 Playlist (only if the human supplies more tracks)
- `src/public/audio/` with 2–3 mp3s + a `TRACKS` array (title, file).
  Crossfade via TWO THREE.Audio instances alternating (volume stepped in the
  render loop — see the d7cb8db bug note; no AudioParam ramps). Track-name
  toast reusing the music pill. Analyser must follow the active track —
  simplest: one analyser per Audio, swap `analyser` reference at crossfade
  midpoint. Skip this task if no tracks are provided.

### 1.5 Flight: reset to start  — model: Sonnet (tiny) — DONE (commit cfce95c)
- Key **H** (home) and GUI button "Return home": smoothly lerp camera back to
  spawn (`0, 30, 100`) over ~1.5s, easing out; works in both flight and orbit
  modes. In flight mode stay in flight (just move); in orbit mode also reset
  `controls.target` to origin. Guard: ignore H while already homing.
- Also add to the flight HUD hint: `h home`.
- Acceptance: get lost 2000 units out, press H, land at spawn facing the text.

## Phase 5 — dancer personality (the zany arc)

Staged asset: `src/public/models/anims/talking.glb` — 3.8s talking-gesture
clip, same Ch32 skeleton as the dancers, verified binding (52/52 targets).
Load it like any dance clip.

### 5.1 Canned affirmations  — model: Sonnet
- Click a dancer (raycast; they're SkinnedMesh under clones — raycast
  against `dancer.model` subtree, `recursive: true`): dancer plays
  `talking.glb` (loop ×2, then back to dancing) while a speech bubble shows a
  random line from a hardcoded `AFFIRMATIONS` array (~30 lines, funky tone:
  "you're doing amazing, kid", "hydrate!", "your git history is beautiful").
- Bubble = HTML div positioned via `Vector3.project()` each frame above the
  dancer's head bone (`mixamorig8:Head` — `getObjectByName` on the clone),
  styled like the existing black/yellow pills. Hide after ~4s.
- Acceptance: click dancer → talk gesture + bubble; other two keep dancing;
  clicks while talking are ignored; mobile tap works.

### 5.2 AI chat with the dancers  — model: Opus (has a server component)
Talk to a dancer; it answers in character via OpenRouter on a dirt-cheap model.
- **Key never ships to the browser.** Add ONE route to
  `~/professional-site/app.js` (this is the sanctioned exception to the
  don't-touch rule; keep the diff minimal): `POST /funky/api/chat`
  { message, history } → OpenRouter chat completion → { reply }.
  Key from `~/media-center/.env` (`OPENROUTER_*`) loaded server-side.
  Executor picks the cheapest sane model on OpenRouter at build time
  (small Llama/Gemma class); `max_tokens: 120`, temperature high.
- Guardrails, non-negotiable: rate limit (e.g. 10 req/min/IP + 300/day
  global), 500-char input cap, no user data in the system prompt, **no
  Obsidian/vault/CRM context — the persona is fully synthetic**, and a
  monthly spend limit set on the OpenRouter dashboard by the human.
- System prompt: breakdancer persona, upbeat, 2 sentences max, never claims
  to be Arta or know him personally, refuses personal questions gracefully
  ("I just dance here, man").
- Frontend: chat opens when clicking an already-talking dancer (or a GUI
  button). Input pill bottom-center; replies appear in the 5.1 speech bubble;
  `talking.glb` loops while "speaking". Fallback to canned affirmations if
  the endpoint errors — feature degrades, never breaks.
- Acceptance: chat round-trip < 3s, rate limit returns a funny in-character
  refusal, killing the endpoint leaves 5.1 fully working.

## Phase 6 — idea backlog (unspec'd; promote to tasks when wanted)

Website-side zany:
- **Konami code** → disco: all dancers + strobing cube + tempo-doubled
  animation timeScale for 20s.
- **Typing echo**: keystrokes (outside flight/GUI) spawn floating 3D letters
  that drift off like balloons. Cheap TextGeometry pool.
- **Time-of-day auto-sky**: pick HDRI preset from visitor's local clock
  (day/dusk/night), still overridable in GUI.
- **Visitor trails**: anonymized recent-visitor count as extra seagulls
  (needs a tiny counter endpoint — same guardrail rules as 5.2).
- **Cube physics**: throwable cube — verlet + water bounce + splash.

IoT / media-center crossovers (server already runs ntfy, Homebridge,
Reolink cams, HL-2140 printer — all on Tailscale):
- **ntfy → fireworks**: server publishes to a public topic on real events
  (deploy finished, backup OK); website subscribes over ntfy's WebSocket/SSE
  and fires a firework per event. Read-only, no auth risk, very funky.
- **Server-heartbeat island**: floating monument showing live CPU/RAM/uptime
  from a tiny public JSON endpoint (whitelist those three numbers, nothing
  else — no hostnames, no versions).
- **Doorbell wave**: Reolink motion event (via ntfy) → dancers face camera
  and wave (talking.glb works as the gesture). Purely cosmetic on the
  public site; the trigger carries zero payload.
- **Guestbook printer**: visitors leave a 1-line note → prints on the
  HL-2140. High spam/abuse risk: needs hard rate limit (1/visitor/day,
  20/day global), profanity filter, and a kill switch. Fun, but implement
  LAST and disable by default.
- Anything IoT-inbound (website → server actions beyond printing): don't.
  Outbound telemetry only; admin stays Tailscale-side.

## Phase 7 — the god-head (longshot arc)

Concept: a floating bust of Arta's head in the sky — deliberately low-poly /
PS1-pixelated (bad is the aesthetic), mouth flapping, and once per visitor per
day it speaks a blessing in Arta's actual voice (ElevenLabs voice clone
already exists). This is the "okay, he has a personality" moment.

### 7.0 Getting the head  — human task, no model needed
- Capture: phone photogrammetry app (Polycam / KIRI Engine / RealityScan,
  all have free tiers) → export mesh; or Blender **FaceBuilder** addon from
  ~5 photos. Quality does not matter — pixelation hides every sin.
- Blender cleanup (~15 min): decimate to ≤ 10k tris, bake one diffuse
  texture, add ONE shape key `mouthOpen` (select jaw verts, pull down),
  export GLB. That single morph target is the entire facial rig.
- PS1 look: `NearestFilter` on the texture + low poly count is enough.
  No postprocessing pass needed.

### 7.1 Floating head + flappy mouth  — model: Opus
- Head floats high over the scene (y ≈ 250), slow bob + rotate; head does
  `lookAt(camera)` with damped slerp — eyes following the visitor is 90% of
  the personality for ~5 lines of code.
- **Lip sync = amplitude, not visemes.** Play blessing mp3 through its own
  THREE.Audio + AudioAnalyser (separate from music); each frame drive
  `mesh.morphTargetInfluences[mouthOpen]` from smoothed amplitude. Flappy
  Muppet mouth is the bit. Do NOT build a viseme pipeline (Rhubarb etc.) —
  wrong effort/reward ratio here.
- **Tier 1 ships the whole dream with ZERO runtime keys**: pre-generate
  ~20 blessing mp3s with ElevenLabs once (by hand, in their web UI), ship
  as static files in `src/public/audio/blessings/`. Gate: localStorage
  date stamp = once per visitor per day; returning same-day visitors see
  the head but it stays serene. Music ducks (setVolume, render loop — see
  d7cb8db note) while the head speaks.
- Acceptance: first visit of the day → head turns to you, mouth moves in
  sync, voice plays; second visit → silent head still tracks camera;
  music ducks and recovers; mobile OK (tap fallback for autoplay policy —
  reuse the music-pill gesture pattern).

### 7.2 Live AI blessings  — model: Opus (server component)
- Tier 2, only after 7.1 works. `POST /funky/api/blessing` in
  `~/professional-site/app.js` (same sanctioned-exception + guardrail set
  as 5.2): OpenRouter cheap model writes a 1–2 sentence blessing →
  ElevenLabs TTS API (their cheapest/Flash-class model) → stream audio back.
- **ElevenLabs has no standalone LLM** — their "Agents" product bundles an
  LLM+voice pipeline but is overkill and pricier; chain
  OpenRouter → ElevenLabs instead.
- Guardrails on top of 5.2's: 1 generation per IP per day, cache audio by
  text hash (repeat texts cost zero), ElevenLabs character quota is
  hard-capped by plan tier anyway, monthly spend caps on BOTH dashboards.
  Endpoint dies → fall back to tier-1 canned mp3s. Degrades, never breaks.
- No user data in prompts. Blessing seeds allowed: time of day, sky preset,
  book title from 7.3. Nothing else.

### 7.3 The head has read a book  — model: Sonnet (after 7.2)
- Hardcover.app GraphQL API (bearer token, server-side env var): fetch
  "currently reading" title/author, cache 24h in memory. Blessing template:
  "I've been reading <title> lately — <canned or generated sentence>."
  Book title is the only personal data exposed — that's fine, it's a flex.
- **Kobo highlights via Obsidian: tempting, but NO live vault reads** —
  same rule as 5.2 (vault is off-limits to public-facing AI). Sanctioned
  version if ever wanted: human hand-picks favorite highlights into a
  `quotes.json` committed to this repo. Export, not integration.

### 7.x bounce-off backlog (unspec'd)
- **Blink + idle life**: second shape key `blink`, random 3–7s; faint hum
  or breath loop when idle. Cheap, huge.
- **Oracle mode**: click the head, ask a yes/no question, Magic-8-ball
  canned answers in the 5.1 speech bubble. Zero API, pure personality.
- **`?recruiter=1`**: head delivers a 15-second elevator pitch mp3 on
  arrival, portfolio islands pulse. Link this URL on the resume.
- **Blessing counter**: "6,401 blessings bestowed" etched on a floating
  stone (tiny counter endpoint, same rules as visitor-trails idea).
- **Now-listening**: ListenBrainz/Last.fm scrobble (server-side, cached
  24h like 7.3) → head occasionally mentions what Arta's playing.
- **Weather-mirror sky**: open-meteo (keyless API) for Philly → default
  sky preset matches Arta's actual weather. Pairs with time-of-day idea.

---

## Execution advice (for the human)

- **Sonnet 5**: fine for every task marked Sonnet — specs above are tight.
  If a task touches shaders and the first attempt renders black, escalate
  that one task to Opus rather than iterating blind.
- **Opus**: 2.3 and 3.1 (multi-file, judgment calls, shader integration).
- One task per session. After each: `npm run build`, clean stale bundles,
  browser-check (console clean, fps fine, mobile sanity), commit, stop.
- Session opener that works: "Read ROADMAP.md. Do task N.N only. Follow the
  architecture notes and Do-NOT list."
