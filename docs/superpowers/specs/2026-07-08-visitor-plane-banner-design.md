# Visitor Counter Banner Plane — Design

**Goal:** A procedural low-poly plane tows a banner showing the site's visitor count, flying across the sky once on page load and on demand via a HUD button. Clicking the plane cycles which stat the banner shows.

## Counters

Three numbers, tracked server-side (professional-site), persisted to `data/visitor-count.json` so they survive restarts (unlike the dancer-line daily cap, this number's whole point is to keep climbing):

- `totalLoads` — incremented on every call, no dedup.
- `dailyUnique` — incremented once per distinct visitor ID per UTC day (same day-key-rollover pattern as `DANCER_LINE_DAILY_CAP`).
- `lifetimeUnique` — incremented once per distinct visitor ID, ever.

All three start at 0 (no seeded/fake starting number).

Visitor ID: a `crypto.randomUUID()` generated client-side once and persisted in `localStorage` (`funky_visitor_id`). Soft identity, spoofable — same trust tier as everything else in this project. If localStorage is unavailable, generate an ephemeral in-memory ID for that page load (won't dedupe correctly, acceptable).

## Server: `POST /funky/api/visit`

Request body: `{ visitorId: string }`. No auth, no rate limiting beyond Express's existing body-size limit — unlike the AI dialogue route, nothing here costs money per call, so there's no cost guardrail to design.

On each call:
1. Load counters from `data/visitor-count.json` (in-memory cache after first load; write-through on every mutation — traffic is low enough that this is cheap).
2. `totalLoads++` always.
3. If `visitorId` not in today's seen-set: `dailyUnique++`, add to today's set. Roll the set over on UTC date change.
4. If `visitorId` not in the all-time seen-set: `lifetimeUnique++`, add to the all-time set.
5. Persist, respond `{ totalLoads, dailyUnique, lifetimeUnique }`.

Corrupt/missing JSON file on boot → start from a zeroed state, log a warning, don't crash.

## Client: visit tracking

On scene init, ensure `funky_visitor_id` exists in localStorage (generate if missing), `POST` it to `/api/visit`, cache the returned `{ totalLoads, dailyUnique, lifetimeUnique }` in a module-level `visitStats` object. Fetch failure → `visitStats` stays null; the plane simply skips its auto-flight for that load (decorative feature, not critical path) and "Summon Plane" becomes a silent no-op (console warning only).

## PlaneBanner component

New file `src/components/planeBanner.js`, same shape as the existing `birds.js`/`rain.js` components (self-contained, exports a small API the main scene calls into).

**Plane:** procedural low-poly geometry (primitives — boxes/cylinders/cones), matching the aesthetic of the existing procedural birds and cube toy. Decorative details encouraged (paint scheme, prop, tail markings) as long as it stays cheap (single draw call or close to it, no new textures beyond the banner's).

**Banner:** a `PlaneGeometry` towed a short distance behind the tail (thin visible tow-line), with a canvas-texture front face. Canvas draws the current stat's number (comma-formatted, e.g. `"VISITOR #4,213"`) and a short label. Flat is correct here — real tow banners are flat cloth, unlike the earlier 3D-name mismatch. Decorative border/color treatment on the banner is welcome.

**Flight path:** straight pass across the sky at a fixed altitude, entering from one horizon edge and exiting the other, then despawns/hides. No looping, no complex path system.

**Triggers:**
- Auto-flies once, ~2s after the scene is ready (gives the visit fetch time to resolve so the banner doesn't show a placeholder).
- "Summon Plane" HUD button, styled like the existing `#music-toggle` pill. Calls the same trigger function. Ignored while a flight is already in progress (no queueing, no cooldown timer — just a simple "already flying" guard).

**Interaction:** hover-highlightable and clickable using the same raycast/highlight pattern already built for dancers, generalized to include the plane's hitbox while a flight is in progress. Click cycles the displayed stat: `lifetimeUnique → dailyUnique → totalLoads → lifetimeUnique`, regenerating the banner's canvas texture in place. The plane does not pause, slow, or divert — texture swap only.

## Explicitly out of scope (this plan)

- **Click plane → talk to the pilot.** Deferred per direct instruction. When built later, will very likely reuse the existing dancer AI-dialogue server route and voice infrastructure pointed at a new "pilot" persona/voice, rather than a new system from scratch. The click-handler here is written as a simple dispatch (stat-cycle is one branch) so adding a pilot-dialogue branch later isn't a rewrite — but no pilot dialogue, camera-focus-on-plane, or new AI persona is built in this pass.
- Seagull-flock-forms-the-number idea (flagged by the user as too complex).
- Any rate-limiting/abuse-hardening beyond Express's default body-size limit.

## Testing

- Server: repeated `curl` calls with same/different `visitorId`s — confirm `totalLoads` always increments, `dailyUnique`/`lifetimeUnique` only increment on genuinely new IDs, confirm counters survive a server restart.
- Client: Playwright — load page, confirm the plane's position changes over time (it's flying), confirm the banner texture shows a number, click the plane mid-flight, confirm the stat changes, click "Summon Plane," confirm a second flight triggers, confirm a second click while already flying is ignored.
