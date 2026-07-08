# Dancer AI Dialogue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Click a background dancer → AI-generated (or canned-fallback) warm affirmation, spoken via ElevenLabs voice, with a hover glow and a camera dolly-in to the dancer's face while they talk.

**Architecture:** A single new server route (`POST /funky/api/dancer-line`) in `~/professional-site/app.js` calls OpenRouter for text and ElevenLabs for voice, gated by a daily cap. The client (`~/funky-website/src/main.js`) extends the existing 5.1 click-to-talk flow: a client-side cooldown decides whether to attempt the AI fetch or go straight to an (now warmly-toned) canned line; every failure mode converges on the exact same canned/fixed-loop path that already ships today.

**Tech Stack:** Node 22 (native `fetch`, `Buffer`), Express (professional-site), vanilla three.js (funky-website), `dotenv`.

## Global Constraints

- OpenRouter model: `meta-llama/llama-3.1-8b-instruct` (verified live during brainstorming — do not substitute a `:free` model; those were tested and are upstream rate-limited).
- ElevenLabs voice: `TX3LPaxmHKxFdv7VOQHJ` ("Liam"). Model: `eleven_flash_v2_5`.
- Daily generation cap: 200/day (server, in-memory, resets on UTC date change).
- Client cooldown: 45s, shared across all 3 dancers (not per-dancer).
- Fetch timeout: 6000ms via `AbortSignal.timeout()`.
- `VOICE_ENABLED` env var in `~/professional-site/.env` fully gates ElevenLabs; when false/absent-from-response, client must degrade to a reading-time-based animation end, not break.
- No user-typed input ever reaches either API.
- `~/professional-site/.env` must be gitignored — it is not currently in `.gitignore`.
- **Never write either API key's raw value into a git-tracked file (including this plan and any doc).** Both keys already live in the gitignored `~/media-center/.env` — always copy by reference (`grep '^KEY_NAME=' file`), never by embedding the literal value.
- Spec: `docs/superpowers/specs/2026-07-08-dancer-ai-dialogue-design.md` — read it in full before starting; this plan implements it verbatim.

---

## Task 1: Server route in professional-site

**Files:**
- Modify: `/home/arta/professional-site/.gitignore`
- Create: `/home/arta/professional-site/.env` (untracked, do not commit)
- Modify: `/home/arta/professional-site/package.json` (via `npm install dotenv`)
- Modify: `/home/arta/professional-site/app.js`

**Interfaces:**
- Produces: `POST /funky/api/dancer-line` → `200 { text: string, audio: string|null }` on success, `429 { error }` at daily cap, `502 { error }` if OpenRouter fails. This is the only interface Task 6 (client fetch) depends on.

- [ ] **Step 1: Add `.env` to `.gitignore`**

Current `.gitignore` (verified during brainstorming):
```
node_modules/
public/funky/js
*.DS_Store
funky-src
public/funky
dist
package-lock.json
```

Append `.env` as a new line at the end.

- [ ] **Step 2: Create `.env` without embedding either raw key in this plan or any git-tracked file**

Both keys already live in the gitignored `~/media-center/.env` (`OPENROUTER_API_KEY` was already there; `ELEVENLABS_API_KEY` was added there during brainstorming specifically so it would never need to appear in a committed file). Copy both by reference, never by value:
```bash
{
  grep '^OPENROUTER_API_KEY=' /home/arta/media-center/.env
  grep '^ELEVENLABS_API_KEY=' /home/arta/media-center/.env
  echo 'VOICE_ENABLED=true'
} > /home/arta/professional-site/.env
chmod 600 /home/arta/professional-site/.env
```

Verify (checks presence of keys without printing values):
```bash
grep -c '^OPENROUTER_API_KEY=\|^ELEVENLABS_API_KEY=\|^VOICE_ENABLED=' /home/arta/professional-site/.env
```
Expected: `3`

- [ ] **Step 3: Install `dotenv`**

```bash
cd /home/arta/professional-site && npm install dotenv
```
Expected: adds `dotenv` to `dependencies` in `package.json`. (`package-lock.json` is gitignored — no need to worry about it.)

- [ ] **Step 4: Add the route to `app.js`**

At the very top of `/home/arta/professional-site/app.js`, before the existing `import express from 'express';` line, add:
```js
import 'dotenv/config';
```

Immediately before the existing `app.listen(port, () => {` line, add:
```js
let dancerLineCount = 0;
let dancerLineDayKey = null;
const DANCER_LINE_DAILY_CAP = 200;

app.post('/funky/api/dancer-line', async (req, res) => {
  const todayKey = new Date().toISOString().slice(0, 10);
  if (todayKey !== dancerLineDayKey) {
    dancerLineDayKey = todayKey;
    dancerLineCount = 0;
  }
  if (dancerLineCount >= DANCER_LINE_DAILY_CAP) {
    return res.status(429).json({ error: 'daily cap reached' });
  }
  dancerLineCount++;

  let text;
  try {
    const orResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-3.1-8b-instruct',
        messages: [
          {
            role: 'system',
            content: "You are a friendly street dancer at a small personal portfolio website. Offer the visitor one short, warm, sincere, and touching thought about life, kindness, or being human — heartfelt and universal, never hype, never about code or technology. Two sentences maximum. Never claim to be the site's owner or to know the visitor personally; if asked something personal, gently deflect in character (e.g. 'I just dance here, but I'm glad you're here').",
          },
          { role: 'user', content: 'Say something to the visitor.' },
        ],
        max_tokens: 60,
        temperature: 0.9,
      }),
    });
    if (!orResponse.ok) throw new Error(`OpenRouter ${orResponse.status}`);
    const orData = await orResponse.json();
    text = orData.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('empty OpenRouter response');
  } catch (err) {
    console.error('dancer-line: OpenRouter failed:', err.message);
    return res.status(502).json({ error: 'text generation failed' });
  }

  let audio = null;
  if (process.env.VOICE_ENABLED === 'true') {
    try {
      const elResponse = await fetch(
        'https://api.elevenlabs.io/v1/text-to-speech/TX3LPaxmHKxFdv7VOQHJ',
        {
          method: 'POST',
          headers: {
            'xi-api-key': process.env.ELEVENLABS_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5' }),
        }
      );
      if (!elResponse.ok) throw new Error(`ElevenLabs ${elResponse.status}`);
      const buffer = Buffer.from(await elResponse.arrayBuffer());
      audio = buffer.toString('base64');
    } catch (err) {
      console.error('dancer-line: ElevenLabs failed (text-only fallback):', err.message);
    }
  }

  res.json({ text, audio });
});

```
(Leave the existing `app.listen(...)` block immediately after this, unchanged.)

- [ ] **Step 5: Restart the service and smoke-test with curl**

```bash
sudo systemctl restart professional-site
sleep 1
curl -s -X POST http://localhost:3000/funky/api/dancer-line | python3 -m json.tool
```
Expected: `{"text": "<some warm sentence>", "audio": "<long base64 string>"}` (audio present since `VOICE_ENABLED=true`).

Then verify the daily cap logic doesn't false-trigger and errors are well-formed:
```bash
sudo systemctl status professional-site --no-pager | head -5
journalctl -u professional-site -n 20 --no-pager
```
Expected: service `active (running)`, no stack traces in the log from the request just made.

- [ ] **Step 6: Commit (app.js + .gitignore only — never `.env`)**

```bash
cd /home/arta/professional-site
git add app.js .gitignore package.json
git status --short   # confirm .env is NOT listed
git commit -m "feat: add POST /funky/api/dancer-line (OpenRouter + ElevenLabs)"
```

---

## Task 2: Hover glow + material-clone fix

**Files:**
- Modify: `/home/arta/funky-website/src/main.js:594-619` (`enableDancer`'s fbx-loaded callback)
- Modify: `/home/arta/funky-website/src/main.js:692-712` (`onDancerClick`)
- Modify: `/home/arta/funky-website/src/main.js:278` (listener registration in `init()`)

**Interfaces:**
- Produces: `raycastDancer(clientX, clientY) → dancer|null`, `dancer.mesh` (the SkinnedMesh, added to the dancer object), `hoveredDancer` (module-level state). Task 4/6 don't depend on this directly, but Task 4's click guard sits right next to `onDancerClick`, so read this task's diff before touching that function again.

- [ ] **Step 1: Find each dancer's mesh at creation time and clone its material**

In `enableDancer()`, the current fbx-loaded block (main.js:597-611) is:
```js
            if (fbx) {
                fbx.position.set(pos.x, pos.y, pos.z);
                scene.add(fbx);
                const dancerMixer = new THREE.AnimationMixer(fbx);
                const animOffset = Math.floor(i * danceAnimations.length / DANCER_POSITIONS.length);
                const dancer = {
                    model: fbx, mixer: dancerMixer, animIndex: animOffset, currentAction: null,
                    loading: false, clipElapsed: 0, clipDuration: Infinity,
                    // GLTFLoader strips ':' from node names, so the source rig's
                    // "mixamorig8:Head" comes through as "mixamorig8Head".
                    headBone: fbx.getObjectByName('mixamorig8Head'), talking: false,
                    bubbleEl: null, bubbleUntil: 0,
                };
                dancers.push(dancer);
                playDancerNextAnimation(dancer);
            }
```

Replace it with (adds a material-clone pass so hover glow on one dancer can't leak onto the other two — `SkeletonUtils.clone()` shares material references across clones by default — plus captures the mesh reference the glow needs):
```js
            if (fbx) {
                fbx.position.set(pos.x, pos.y, pos.z);
                let dancerMesh = null;
                fbx.traverse((child) => {
                    if (child.isMesh) {
                        child.material = child.material.clone();
                        dancerMesh = child;
                    }
                });
                scene.add(fbx);
                const dancerMixer = new THREE.AnimationMixer(fbx);
                const animOffset = Math.floor(i * danceAnimations.length / DANCER_POSITIONS.length);
                const dancer = {
                    model: fbx, mesh: dancerMesh, mixer: dancerMixer, animIndex: animOffset, currentAction: null,
                    loading: false, clipElapsed: 0, clipDuration: Infinity,
                    // GLTFLoader strips ':' from node names, so the source rig's
                    // "mixamorig8:Head" comes through as "mixamorig8Head".
                    headBone: fbx.getObjectByName('mixamorig8Head'), talking: false,
                    bubbleEl: null, bubbleUntil: 0,
                };
                dancers.push(dancer);
                playDancerNextAnimation(dancer);
            }
```

- [ ] **Step 2: Extract the shared raycast helper and simplify `onDancerClick`**

Current `onDancerClick` (main.js:692-712):
```js
function onDancerClick(e) {
    if (flight.enabled || dancers.length === 0) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    dancerRaycaster.setFromCamera(ndc, camera);
    const hits = dancerRaycaster.intersectObjects(dancers.map(d => d.model), true);
    if (hits.length === 0) return;
    const hitObj = hits[0].object;
    const dancer = dancers.find(d => {
        let o = hitObj;
        while (o) {
            if (o === d.model) return true;
            o = o.parent;
        }
        return false;
    });
    if (dancer) triggerAffirmation(dancer);
}
```

Replace it with (extracts the raycast so `onDancerHover` can reuse it):
```js
function raycastDancer(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
    );
    dancerRaycaster.setFromCamera(ndc, camera);
    const hits = dancerRaycaster.intersectObjects(dancers.map(d => d.model), true);
    if (hits.length === 0) return null;
    const hitObj = hits[0].object;
    return dancers.find(d => {
        let o = hitObj;
        while (o) {
            if (o === d.model) return true;
            o = o.parent;
        }
        return false;
    }) || null;
}

function onDancerClick(e) {
    if (flight.enabled || dancers.length === 0) return;
    const dancer = raycastDancer(e.clientX, e.clientY);
    if (dancer) triggerAffirmation(dancer);
}

let hoveredDancer = null;

function setDancerHighlight(dancer, on) {
    if (!dancer.mesh) return;
    dancer.mesh.material.emissive.setHex(on ? 0xffdd55 : 0x000000);
    dancer.mesh.material.emissiveIntensity = on ? 0.6 : 0;
}

function onDancerHover(e) {
    if (flight.enabled || dancers.length === 0) {
        if (hoveredDancer) {
            setDancerHighlight(hoveredDancer, false);
            hoveredDancer = null;
            renderer.domElement.style.cursor = 'auto';
        }
        return;
    }
    const hit = raycastDancer(e.clientX, e.clientY);
    if (hit === hoveredDancer) return;
    if (hoveredDancer) setDancerHighlight(hoveredDancer, false);
    hoveredDancer = hit;
    if (hoveredDancer) setDancerHighlight(hoveredDancer, true);
    renderer.domElement.style.cursor = hoveredDancer ? 'pointer' : 'auto';
}
```

- [ ] **Step 3: Register the `mousemove` listener**

In `init()`, main.js:278 currently has:
```js
    renderer.domElement.addEventListener('click', onDancerClick);
    renderer.domElement.addEventListener('dblclick', onFireworkDoubleClick);
```
Add a line after it:
```js
    renderer.domElement.addEventListener('click', onDancerClick);
    renderer.domElement.addEventListener('dblclick', onFireworkDoubleClick);
    renderer.domElement.addEventListener('mousemove', onDancerHover);
```

- [ ] **Step 4: Build and verify materials are independent + hover toggles emissive**

```bash
cd /home/arta/funky-website && npm run build 2>&1 | tail -15
```
Expected: clean build, no errors. Then remove the stale hashed bundle (keep only the one referenced by `dist/index.html`):
```bash
grep -o 'assets/index-[^"]*\.js' dist/index.html
command ls dist/assets/
# rm whichever .js in dist/assets/ is NOT the one index.html references
```

Write and run this Playwright check (adjust the port/URL if the dev server differs from the live `:3000/funky/` mount):
```js
// /tmp/verify_hover.mjs
import { chromium } from 'playwright';
const errors = [];
const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto('http://localhost:3000/funky/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#loadingScreen', { state: 'hidden', timeout: 20000 });
await page.evaluate(() => {
  const t = [...document.querySelectorAll('.title')].find(x => x.textContent.trim() === 'Dancer');
  t.nextElementSibling.querySelector('input[type=checkbox]').click();
});
await page.waitForTimeout(7000); // dancer models + first anim clip need to load
const cursorAfterMove = await page.evaluate(() => {
  document.querySelector('canvas').dispatchEvent(new MouseEvent('mousemove', { clientX: 640, clientY: 400, bubbles: true }));
  return document.querySelector('canvas').style.cursor;
});
console.log('cursor after a mousemove (pointer or auto is fine, just must not throw):', cursorAfterMove);
console.log(JSON.stringify({ errors }));
await browser.close();
```
```bash
node /tmp/verify_hover.mjs
```
Expected: `"errors":[]`. (Confirming the *exact* hovered dancer requires knowing on-screen dancer positions at that moment — accept "no errors, cursor style changed to something" here; do a live visual glance for "does it actually light up" the same way 1.3's bird visibility issue was caught, per the spec's testing-plan section.)

- [ ] **Step 5: Commit**

```bash
cd /home/arta/funky-website
git add src/main.js
git commit -m "feat: hover glow on dancers + fix shared-material bug

SkeletonUtils.clone() shares material references across clones by
default — all 3 dancers were pointing at the same material object.
Cloning per-dancer at creation makes the hover emissive independent."
```

---

## Task 3: Warm affirmation tone

**Files:**
- Modify: `/home/arta/funky-website/src/main.js:127-158` (the `AFFIRMATIONS` array)

**Interfaces:**
- Produces: `AFFIRMATIONS` (array of 20 strings) — consumed by Task 5's `playCannedAffirmation`.

- [ ] **Step 1: Replace the array**

Replace main.js:127-158 (the entire `const AFFIRMATIONS = [...]` block) with:
```js
const AFFIRMATIONS = [
    "You are incredible. Thank you so much for visiting.",
    "Keep it up. You are doing so well.",
    "The people in your life are fortunate to have you.",
    "You carry more light than you know.",
    "Whatever you're working through, you're doing better than you think.",
    "Someone out there is grateful you exist.",
    "You've survived every hard day so far. That's no small thing.",
    "Be gentle with yourself today. You deserve that.",
    "The world is a little better because you're in it.",
    "You don't have to have it all figured out to be enough.",
    "Someone, somewhere, is smiling because they know you.",
    "Your kindness matters more than you realize.",
    "You are allowed to rest. You are allowed to be proud of yourself.",
    "Thank you for showing up, today and every day.",
    "You are worthy of the love you give so freely to others.",
    "This moment is a gift, and so are you.",
    "You've made it this far. Keep going, gently.",
    "Someone believes in you, even on the days you don't believe in yourself.",
    "You are exactly where you need to be.",
    "Take a breath. You are safe, and you are loved.",
];
```

- [ ] **Step 2: Verify the old lines are gone and the count is right**

```bash
grep -c "your git history\|hydrate!\|semicolon believes\|dance break: mandatory" /home/arta/funky-website/src/main.js
```
Expected: `0`
```bash
node -e "
const fs = require('fs');
const src = fs.readFileSync('/home/arta/funky-website/src/main.js', 'utf8');
const match = src.match(/const AFFIRMATIONS = \[([\s\S]*?)\];/);
const count = (match[1].match(/^\s*\"/gm) || []).length;
console.log('affirmation count:', count);
"
```
Expected: `affirmation count: 20`

- [ ] **Step 3: Build and commit**

```bash
cd /home/arta/funky-website && npm run build 2>&1 | tail -10
# clean stale bundle as in Task 2 Step 4
git add src/main.js
git commit -m "content: replace canned affirmations with warmer, non-technical tone"
```

---

## Task 4: Camera dolly-in/out on dancer click

**Files:**
- Modify: `/home/arta/funky-website/src/main.js` (add state near `homing`/`homeFrom`, line ~63-66; add functions near `startHoming`, line ~427; hook into `animate()`'s homing/flight branch, line ~830-843; hook into `triggerAffirmation`, line ~652; add a guard to `startHoming`, line ~428; add a guard to `onDancerClick`, from Task 2)

**Interfaces:**
- Consumes: `dancer.headBone` (THREE.Object3D, set in Task 2/existing code), `dancer.talking` (boolean, existing), `camera`, `controls` (module-level, existing).
- Produces: `cameraFocus` (module-level, `null` or `{ dancer, savedPos, savedTarget, phase, elapsed }`), `startCameraFocus(dancer)`, `updateCameraFocus(dt)`. Task 6's `finishTalking` relies on nothing here directly — the camera watches `dancer.talking` itself, so any code path that flips `talking` back to `false` (existing `finished` mixer event today, Task 6's `finishTalking` tomorrow) automatically ends the hold phase.

- [ ] **Step 1: Add camera-focus state near the existing `homing` state**

Current (main.js:60-66):
```js
const dancerRaycaster = new THREE.Raycaster();

...

const SPAWN_POSITION = new THREE.Vector3(0, 30, 100);
let homing = false;
let homeElapsed = 0;
const HOME_SECONDS = 1.5;
const homeFrom = new THREE.Vector3();
```
Add after the `homeFrom` line:
```js
let cameraFocus = null; // { dancer, savedPos, savedTarget, phase: 'in'|'holding'|'out', elapsed }
const CAMERA_FOCUS_SECONDS = 1.2;
const CAMERA_FOCUS_MAX_HOLD_MS = 8000;
const CAMERA_FOCUS_DISTANCE = 18;
const cameraFocusFrom = new THREE.Vector3();
const cameraFocusTo = new THREE.Vector3();
```

- [ ] **Step 2: Add `startCameraFocus` / `updateCameraFocus`, and guard `startHoming` against overlap**

Current `startHoming` (main.js:427-432):
```js
function startHoming() {
    if (homing) return;
    homing = true;
    homeElapsed = 0;
    homeFrom.copy(camera.position);
}
```
Replace with (adds the overlap guard, then the two new functions right after):
```js
function startHoming() {
    if (homing || cameraFocus) return;
    homing = true;
    homeElapsed = 0;
    homeFrom.copy(camera.position);
}

function startCameraFocus(dancer) {
    if (cameraFocus || !dancer.headBone) return;
    const headPos = dancer.headBone.getWorldPosition(new THREE.Vector3());
    const awayFromHead = new THREE.Vector3().subVectors(camera.position, headPos);
    if (awayFromHead.lengthSq() < 1e-6) awayFromHead.set(0, 0, 1);
    awayFromHead.normalize();

    cameraFocusFrom.copy(camera.position);
    cameraFocusTo.copy(headPos).addScaledVector(awayFromHead, CAMERA_FOCUS_DISTANCE);

    controls.enabled = false;
    cameraFocus = {
        dancer,
        savedPos: camera.position.clone(),
        savedTarget: controls.target.clone(),
        phase: 'in',
        elapsed: 0,
    };
}

function updateCameraFocus(dt) {
    if (!cameraFocus) return;
    const headPos = cameraFocus.dancer.headBone.getWorldPosition(new THREE.Vector3());

    if (cameraFocus.phase === 'in') {
        cameraFocus.elapsed += dt;
        const t = Math.min(1, cameraFocus.elapsed / CAMERA_FOCUS_SECONDS);
        const eased = 1 - Math.pow(1 - t, 3);
        camera.position.lerpVectors(cameraFocusFrom, cameraFocusTo, eased);
        camera.lookAt(headPos);
        if (t >= 1) {
            cameraFocus.phase = 'holding';
            cameraFocus.elapsed = 0;
        }
    } else if (cameraFocus.phase === 'holding') {
        camera.lookAt(headPos);
        cameraFocus.elapsed += dt * 1000;
        if (!cameraFocus.dancer.talking || cameraFocus.elapsed >= CAMERA_FOCUS_MAX_HOLD_MS) {
            cameraFocusFrom.copy(camera.position);
            cameraFocus.phase = 'out';
            cameraFocus.elapsed = 0;
        }
    } else if (cameraFocus.phase === 'out') {
        cameraFocus.elapsed += dt;
        const t = Math.min(1, cameraFocus.elapsed / CAMERA_FOCUS_SECONDS);
        const eased = 1 - Math.pow(1 - t, 3);
        camera.position.lerpVectors(cameraFocusFrom, cameraFocus.savedPos, eased);
        camera.lookAt(cameraFocus.savedTarget);
        if (t >= 1) {
            controls.target.copy(cameraFocus.savedTarget);
            controls.enabled = true;
            cameraFocus = null;
        }
    }
}
```

- [ ] **Step 3: Wire into `animate()`'s camera-control branch**

Current (main.js:830-843):
```js
        if (homing) {
            homeElapsed += dt;
            const t = Math.min(1, homeElapsed / HOME_SECONDS);
            const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
            camera.position.lerpVectors(homeFrom, SPAWN_POSITION, eased);
            if (t >= 1) {
                homing = false;
                flight.velocity.set(0, 0, 0);
                if (!flight.enabled) controls.target.set(0, 0, 0);
            }
        } else {
            flight.update(dt);
            if (!flight.enabled) controls.update();
        }
```
Replace with:
```js
        if (homing) {
            homeElapsed += dt;
            const t = Math.min(1, homeElapsed / HOME_SECONDS);
            const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
            camera.position.lerpVectors(homeFrom, SPAWN_POSITION, eased);
            if (t >= 1) {
                homing = false;
                flight.velocity.set(0, 0, 0);
                if (!flight.enabled) controls.target.set(0, 0, 0);
            }
        } else if (cameraFocus) {
            updateCameraFocus(dt);
        } else {
            flight.update(dt);
            if (!flight.enabled) controls.update();
        }
```

- [ ] **Step 4: Trigger the focus from a click, and block a second dancer mid-focus**

In `onDancerClick` (added in Task 2), add the `cameraFocus` guard:
```js
function onDancerClick(e) {
    if (flight.enabled || dancers.length === 0 || cameraFocus) return;
    const dancer = raycastDancer(e.clientX, e.clientY);
    if (dancer) triggerAffirmation(dancer);
}
```

In `triggerAffirmation` (main.js:652-654, first three lines), add the focus start:
```js
function triggerAffirmation(dancer) {
    if (dancer.talking || cameraFocus) return;
    dancer.talking = true;
    startCameraFocus(dancer);
```
(Leave the rest of `triggerAffirmation`'s current body below this untouched for this task — Task 5 replaces it next.)

- [ ] **Step 5: Build and visually verify the dolly with screenshots**

```bash
cd /home/arta/funky-website && npm run build 2>&1 | tail -15
# clean stale bundle as in prior tasks
```
```js
// /tmp/verify_dolly.mjs
import { chromium } from 'playwright';
const errors = [];
const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto('http://localhost:3000/funky/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#loadingScreen', { state: 'hidden', timeout: 20000 });
await page.evaluate(() => {
  const t = [...document.querySelectorAll('.title')].find(x => x.textContent.trim() === 'Dancer');
  t.nextElementSibling.querySelector('input[type=checkbox]').click();
});
await page.waitForTimeout(7000);
await page.screenshot({ path: '/tmp/dolly_0_before.png' });
// grid-sweep click to reliably hit a dancer regardless of current pose (same technique 5.1 needed)
let triggered = false;
for (let x = 150; x <= 1000 && !triggered; x += 60) {
  for (let y = 200; y <= 480 && !triggered; y += 40) {
    await page.mouse.click(x, y);
    await page.waitForTimeout(100);
    triggered = await page.evaluate(() => !!document.querySelector('.dancer-bubble'));
  }
}
console.log('triggered:', triggered);
await page.waitForTimeout(1500); // mid "in" phase
await page.screenshot({ path: '/tmp/dolly_1_in.png' });
await page.waitForTimeout(3000); // holding
await page.screenshot({ path: '/tmp/dolly_2_holding.png' });
await page.waitForTimeout(6000); // past the fixed 2-loop clip (~7.6s) — should be returning/returned
await page.screenshot({ path: '/tmp/dolly_3_after.png' });
console.log(JSON.stringify({ errors }));
await browser.close();
```
```bash
node /tmp/verify_dolly.mjs
```
Expected: `"errors":[]`, `triggered: true`. Look at the four screenshots: `dolly_0_before` and `dolly_3_after` should show similar/near-identical framing (camera returned); `dolly_1_in`/`dolly_2_holding` should show a visibly closer, different framing than the other two (camera actually moved). This is the same screenshot-and-look verification style used for 1.2/1.3/2.1/2.2/2.3 this session — swiftshader renders standard geometry/lookAt fine, this isn't a custom-varying shader.

- [ ] **Step 6: Commit**

```bash
cd /home/arta/funky-website
git add src/main.js
git commit -m "feat: camera dollies in to a dancer's face while they talk

Reuses the same ease-out-cubic lerp pattern as the existing H/return-
home feature. Holds until the dancer stops talking or an 8s safety
cap elapses, whichever is first, then eases back and hands control
to OrbitControls."
```

---

## Task 5: Refactor talk-flow internals (pure refactor, no behavior change)

**Files:**
- Modify: `/home/arta/funky-website/src/main.js:652-690` (`triggerAffirmation`, `showAffirmationBubble`)
- Modify: `/home/arta/funky-website/src/main.js:904-925` (`animate()`'s `dancers.forEach` block)

**Interfaces:**
- Produces: `playCannedAffirmation(dancer)`, `finishTalking(dancer, action)`, `showAffirmationBubble(dancer, text)` (signature changed — now takes explicit text). Task 6 calls all three of these.

This task must not change observable behavior at all — it's purely restructuring the existing 5.1 code so Task 6 has clean seams to attach to. Verify with the *same* test as before this task (canned affirmation still works identically) before moving on.

- [ ] **Step 1: Split `triggerAffirmation` into a dispatcher + `playCannedAffirmation` + `finishTalking`, and make the bubble take explicit text**

Current (main.js:652-690, including the `if (dancer.talking...)` / `startCameraFocus` lines Task 4 just added):
```js
function triggerAffirmation(dancer) {
    if (dancer.talking || cameraFocus) return;
    dancer.talking = true;
    startCameraFocus(dancer);
    AssetLoader.loadNextAnimation('models/anims/talking.glb', (clip) => {
        if (!clip) {
            dancer.talking = false;
            return;
        }
        if (dancer.currentAction) dancer.currentAction.fadeOut(0.3);
        const action = dancer.mixer.clipAction(clip);
        action.reset();
        action.setLoop(THREE.LoopRepeat, 2);
        action.clampWhenFinished = true;
        action.fadeIn(0.3);
        action.play();
        dancer.currentAction = action;
        showAffirmationBubble(dancer);

        const onFinished = (e) => {
            if (e.action !== action) return;
            dancer.mixer.removeEventListener('finished', onFinished);
            dancer.talking = false;
            playDancerNextAnimation(dancer);
        };
        dancer.mixer.addEventListener('finished', onFinished);
    });
}

function showAffirmationBubble(dancer) {
    if (!dancer.bubbleEl) {
        const el = document.createElement('div');
        el.className = 'dancer-bubble';
        document.body.appendChild(el);
        dancer.bubbleEl = el;
    }
    dancer.bubbleEl.textContent = AFFIRMATIONS[Math.floor(Math.random() * AFFIRMATIONS.length)];
    dancer.bubbleEl.style.display = 'block';
    dancer.bubbleUntil = performance.now() + 4000;
}
```

Replace with:
```js
function triggerAffirmation(dancer) {
    if (dancer.talking || cameraFocus) return;
    dancer.talking = true;
    startCameraFocus(dancer);
    playCannedAffirmation(dancer);
}

function playCannedAffirmation(dancer) {
    AssetLoader.loadNextAnimation('models/anims/talking.glb', (clip) => {
        if (!clip) {
            dancer.talking = false;
            return;
        }
        if (dancer.currentAction) dancer.currentAction.fadeOut(0.3);
        const action = dancer.mixer.clipAction(clip);
        action.reset();
        action.setLoop(THREE.LoopRepeat, 2);
        action.clampWhenFinished = true;
        action.fadeIn(0.3);
        action.play();
        dancer.currentAction = action;
        showAffirmationBubble(dancer, AFFIRMATIONS[Math.floor(Math.random() * AFFIRMATIONS.length)]);

        const onFinished = (e) => {
            if (e.action !== action) return;
            dancer.mixer.removeEventListener('finished', onFinished);
            finishTalking(dancer, action);
        };
        dancer.mixer.addEventListener('finished', onFinished);
    });
}

function finishTalking(dancer, action) {
    if (dancer.currentAction !== action) return; // superseded by a newer trigger already
    dancer.talking = false;
    if (dancer.bubbleEl) dancer.bubbleEl.style.display = 'none';
    playDancerNextAnimation(dancer);
}

function showAffirmationBubble(dancer, text) {
    if (!dancer.bubbleEl) {
        const el = document.createElement('div');
        el.className = 'dancer-bubble';
        document.body.appendChild(el);
        dancer.bubbleEl = el;
    }
    dancer.bubbleEl.textContent = text;
    dancer.bubbleEl.style.display = 'block';
}
```

Note `bubbleUntil` is no longer set here — visibility is now driven entirely by `finishTalking` hiding it explicitly, not a timer. Step 2 removes the now-dead timer check in `animate()`.

- [ ] **Step 2: Remove the timer-based bubble hide from `animate()`**

Current (main.js:904-925):
```js
        dancers.forEach(d => {
            d.mixer.update(dt);

            if (d.bubbleEl && d.bubbleEl.style.display !== 'none') {
                if (performance.now() > d.bubbleUntil) {
                    d.bubbleEl.style.display = 'none';
                } else if (d.headBone) {
                    const headPos = d.headBone.getWorldPosition(new THREE.Vector3());
                    headPos.y += 3; // clear the top of the head
                    headPos.project(camera);
                    d.bubbleEl.style.left = `${(headPos.x * 0.5 + 0.5) * window.innerWidth}px`;
                    d.bubbleEl.style.top = `${(-headPos.y * 0.5 + 0.5) * window.innerHeight}px`;
                }
            }

            if (d.loading || d.talking || !d.currentAction) return;
            d.clipElapsed += dt;
            const ratio = d.clipElapsed / d.clipDuration;
            if ((ratio >= 0.7 && currentPunch > 0.25) || ratio >= 1.3) {
                playDancerNextAnimation(d);
            }
        });
```
Replace with:
```js
        dancers.forEach(d => {
            d.mixer.update(dt);

            if (d.bubbleEl && d.bubbleEl.style.display !== 'none' && d.headBone) {
                const headPos = d.headBone.getWorldPosition(new THREE.Vector3());
                headPos.y += 3; // clear the top of the head
                headPos.project(camera);
                d.bubbleEl.style.left = `${(headPos.x * 0.5 + 0.5) * window.innerWidth}px`;
                d.bubbleEl.style.top = `${(-headPos.y * 0.5 + 0.5) * window.innerHeight}px`;
            }

            if (d.loading || d.talking || !d.currentAction) return;
            d.clipElapsed += dt;
            const ratio = d.clipElapsed / d.clipDuration;
            if ((ratio >= 0.7 && currentPunch > 0.25) || ratio >= 1.3) {
                playDancerNextAnimation(d);
            }
        });
```

Also remove the now-unused `bubbleUntil: 0,` field from the dancer object literal in `enableDancer` (Task 2's Step 1 output) — find:
```js
                    headBone: fbx.getObjectByName('mixamorig8Head'), talking: false,
                    bubbleEl: null, bubbleUntil: 0,
                };
```
Replace with:
```js
                    headBone: fbx.getObjectByName('mixamorig8Head'), talking: false,
                    bubbleEl: null,
                };
```

- [ ] **Step 3: Build and verify canned-affirmation behavior is unchanged**

```bash
cd /home/arta/funky-website && npm run build 2>&1 | tail -15
# clean stale bundle
```
Reuse Task 4's `verify_dolly.mjs` verbatim (it already exercises the full canned-affirmation + camera-dolly path via the grid-sweep click) — rerun it and confirm the same result: `errors: []`, `triggered: true`, dolly-in/out visible across the four screenshots. This task should produce byte-for-byte the same user-visible behavior as Task 4's end state; if anything differs, the refactor broke something.

- [ ] **Step 4: Commit**

```bash
cd /home/arta/funky-website
git add src/main.js
git commit -m "refactor: split talk-flow into playCannedAffirmation/finishTalking

Pure restructuring, no behavior change — creates clean seams for the
AI-line path to attach to without duplicating the canned-line logic.
Bubble visibility now driven by finishTalking instead of a timer."
```

---

## Task 6: AI-line fetch, cooldown, and voice playback

**Files:**
- Modify: `/home/arta/funky-website/src/main.js` (near `triggerAffirmation`/`playCannedAffirmation`, and the music-fade block in `animate()`)

**Interfaces:**
- Consumes: `POST /funky/api/dancer-line` (Task 1), `playCannedAffirmation(dancer)` / `finishTalking(dancer, action)` / `showAffirmationBubble(dancer, text)` (Task 5).
- Produces: the completed feature. Nothing downstream depends on this task.

- [ ] **Step 1: Add cooldown/timeout constants and the AI-path functions**

Add near the top of main.js, alongside other feature constants (e.g. right after the `AFFIRMATIONS` array from Task 3):
```js
const AI_LINE_COOLDOWN_MS = 45000;
const AI_LINE_TIMEOUT_MS = 6000;
```

Replace `triggerAffirmation` (from Task 5) with:
```js
function triggerAffirmation(dancer) {
    if (dancer.talking || cameraFocus) return;
    dancer.talking = true;
    startCameraFocus(dancer);

    const lastAiLineAt = Number(localStorage.getItem('funky_ai_line_cooldown') || 0);
    const cooldownClear = Date.now() - lastAiLineAt >= AI_LINE_COOLDOWN_MS;

    if (cooldownClear) {
        fetchDancerLine(dancer);
    } else {
        playCannedAffirmation(dancer);
    }
}

function fetchDancerLine(dancer) {
    AssetLoader.loadNextAnimation('models/anims/talking.glb', (clip) => {
        if (!clip) {
            dancer.talking = false;
            return;
        }
        if (dancer.currentAction) dancer.currentAction.fadeOut(0.3);
        const action = dancer.mixer.clipAction(clip);
        action.reset();
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.fadeIn(0.3);
        action.play();
        dancer.currentAction = action;

        fetch(`${import.meta.env.BASE_URL}api/dancer-line`, {
            method: 'POST',
            signal: AbortSignal.timeout(AI_LINE_TIMEOUT_MS),
        })
            .then((r) => {
                if (!r.ok) throw new Error(`status ${r.status}`);
                return r.json();
            })
            .then(({ text, audio }) => {
                if (dancer.currentAction !== action) return; // a fallback already took over
                localStorage.setItem('funky_ai_line_cooldown', String(Date.now()));
                showAffirmationBubble(dancer, text);
                if (audio) {
                    playDancerAudio(audio, () => finishTalking(dancer, action));
                } else {
                    const words = text.split(/\s+/).length;
                    const seconds = Math.max(3, words * 0.35);
                    setTimeout(() => finishTalking(dancer, action), seconds * 1000);
                }
            })
            .catch(() => {
                if (dancer.currentAction !== action) return;
                action.fadeOut(0.2);
                playCannedAffirmation(dancer);
            });
    });
}

let duckTarget = 1;
let duckFactor = 1;

function playDancerAudio(base64Mp3, onEnded) {
    const audioEl = new Audio(`data:audio/mpeg;base64,${base64Mp3}`);
    duckTarget = 0.25;
    const stopDucking = () => { duckTarget = 1; onEnded(); };
    audioEl.addEventListener('ended', stopDucking);
    audioEl.addEventListener('error', stopDucking);
    audioEl.play().catch(stopDucking);
}
```

- [ ] **Step 2: Wire music ducking into the existing per-frame volume step**

Current (main.js, inside `animate()`):
```js
        if (sound && sound.isPlaying && fadeProgress < 1) {
            fadeProgress = Math.min(1, fadeProgress + dt / FADE_SECONDS);
            sound.setVolume(audioParams.volume * fadeProgress);
        }
```
Replace with:
```js
        if (sound && sound.isPlaying) {
            if (fadeProgress < 1) fadeProgress = Math.min(1, fadeProgress + dt / FADE_SECONDS);
            duckFactor += (duckTarget - duckFactor) * (1 - Math.exp(-dt / 0.3));
            sound.setVolume(audioParams.volume * fadeProgress * duckFactor);
        }
```

Find the volume slider's `onChange` in `initGUI()`:
```js
    audioFolder.add(audioParams, 'volume', 0, 1).name('Volume').onChange(v => {
        if (sound) sound.setVolume(v * fadeProgress);
    });
```
Replace with (keeps the slider consistent with ducking instead of momentarily overriding it):
```js
    audioFolder.add(audioParams, 'volume', 0, 1).name('Volume').onChange(v => {
        if (sound) sound.setVolume(v * fadeProgress * duckFactor);
    });
```

- [ ] **Step 3: Build and curl-test the route is reachable from the built client's exact path**

```bash
cd /home/arta/funky-website && npm run build 2>&1 | tail -15
# clean stale bundle
grep -o "api/dancer-line" dist/assets/*.js
```
Expected: at least one match (confirms the fetch path made it into the bundle).

- [ ] **Step 4: End-to-end verify against the live server (real API calls — this costs a fraction of a cent)**

```js
// /tmp/verify_ai_line.mjs
import { chromium } from 'playwright';
const errors = [];
const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto('http://localhost:3000/funky/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#loadingScreen', { state: 'hidden', timeout: 20000 });
await page.evaluate(() => {
  const t = [...document.querySelectorAll('.title')].find(x => x.textContent.trim() === 'Dancer');
  t.nextElementSibling.querySelector('input[type=checkbox]').click();
  localStorage.removeItem('funky_ai_line_cooldown'); // force the AI path, not cooldown fallback
});
await page.waitForTimeout(7000);
let triggered = false;
for (let x = 150; x <= 1000 && !triggered; x += 60) {
  for (let y = 200; y <= 480 && !triggered; y += 40) {
    await page.mouse.click(x, y);
    await page.waitForTimeout(200);
    triggered = await page.evaluate(() => !!document.querySelector('.dancer-bubble'));
  }
}
await page.waitForTimeout(2000); // give the fetch a moment to resolve and replace the bubble text
const bubbleText = await page.evaluate(() => document.querySelector('.dancer-bubble')?.textContent);
console.log('bubble text (should be an AI line, not from the canned array):', bubbleText);
const cooldownSet = await page.evaluate(() => !!localStorage.getItem('funky_ai_line_cooldown'));
console.log('cooldown set after a successful AI call:', cooldownSet);
console.log(JSON.stringify({ errors }));
await browser.close();
```
```bash
node /tmp/verify_ai_line.mjs
```
Expected: `errors: []`, `cooldownSet: true`, and `bubbleText` should read as a generated sentence (not one of the 20 hardcoded strings verbatim — spot-check by eye).

Then verify the fallback path still works when the server is unreachable:
```bash
sudo systemctl stop professional-site
```
Rerun `verify_ai_line.mjs`. Expected: still `errors: []`, `cooldownSet: false` this time (fetch failed → fell back to canned, cooldown never set), `bubbleText` should be one of the 20 canned lines.
```bash
sudo systemctl start professional-site
```

- [ ] **Step 5: Commit**

```bash
cd /home/arta/funky-website
git add src/main.js
git commit -m "feat: AI-generated dancer lines with ElevenLabs voice

45s client cooldown (shared across all 3 dancers) decides whether to
attempt POST /funky/api/dancer-line at all. Any failure — cooldown
active, fetch error, 6s timeout, ElevenLabs down server-side — falls
back to the exact existing canned-affirmation path. Music ducks via
the existing per-frame setVolume stepping while dancer audio plays."
```

---

## Self-review notes (already applied above)

- **Spec coverage:** server route + daily cap (Task 1), hover glow + material fix (Task 2), warm tone (Task 3), camera dolly (Task 4), bubble/finish refactor (Task 5), AI fetch/cooldown/voice/ducking (Task 6) — every section of the spec has a task.
- **Type/name consistency checked:** `showAffirmationBubble(dancer, text)` signature is introduced in Task 5 and used identically in Task 6; `finishTalking(dancer, action)` defined in Task 5, called from both Task 5's `onFinished` handler and Task 6's audio/timeout paths; `cameraFocus`/`startCameraFocus`/`updateCameraFocus` defined in Task 4, consumed implicitly (via watching `dancer.talking`) rather than needing Task 6 to call anything — verified this requires no changes to Task 4's code when Task 6 lands.
- **No placeholders:** every step has complete, copy-pasteable code or exact shell commands with expected output.
- **Secret hygiene:** confirmed no raw API key value appears anywhere in this plan document — Task 1 Step 2 copies both keys from the gitignored `~/media-center/.env` by reference (`grep '^KEY='`), never by embedding the literal value.
