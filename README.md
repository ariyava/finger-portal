# Finger Portal 1.1 — three/four-finger portals

Real-time, browser-local AR filters controlled by **three or four fingertips**, on one hand or across both hands. The two-finger beam system has been removed from recognition, rendering, assignments, and the interface.

## Run

On Windows, extract the ZIP and double-click **Start Finger Portal.cmd**. Keep the terminal open. Node.js 22.12+ is required; Node 24 is already installed on the development machine.

Alternatively:

```sh
npm start
```

Open **http://127.0.0.1:5184/**. The included `dist/` has the compiled application, official MediaPipe model, and local JS/WASM runtime. No npm dependencies or external asset downloads are needed to run this included build. Use localhost or HTTPS; do not open the HTML with `file://`.

For development:

```sh
npm ci
npm run dev
npm test
npm run build
```

The postinstall script prepares the local runtime/model. `npm run setup:models` repairs missing assets; rebuilding then updates `dist/`. Vite and the production launcher both default to port 5184, so run one at a time.

## One hand

Gather 3 or 4 fingertips, hold briefly until armed, then separate them. Three fingertips form a triangle; four form a quadrilateral. Bring the same tips together to dissolve the portal. Two fingertips never arm or activate an effect.

All 10 three-finger combinations and all 5 four-finger combinations remain available. Start with thumb + index + middle for noir, or thumb + index + ring for simulated thermal. Thumb + index + middle + pinky opens Rainbow Dimension. Customize these assignments under **Gestures**.

## Shared between two hands

The camera recognizes shared gestures automatically when both hands are visible:

- **3 fingertips total:** gather two tips from one hand and one from the other at one contact point. Hold, then spread the three tips into a triangle.
- **4 fingertips total, one cluster:** gather four tips across both hands (2 + 2 or 3 + 1), hold, then spread.
- **4 fingertips total, paired contacts:** touch **thumb to thumb and index to index** across the two hands. These can be two separate contact points. Hold, then open the hands to form a shared four-corner portal. Bring the original matched tips back together to close it.

The engine supports every mixed three/four-finger combination, not only the example fingers. A shared portal stores each participating **hand ID + finger ID**. Matching and effect stay fixed while active, even when the detection array changes order. The polygon vertices follow the selected tips on both hands, with no separate duplicate effects. Losing either participating hand dissolves the whole shared portal.

Shared portals now default to automatic selection by the exact participating finger identities. Manual triangle/quad choices are explicit overrides. Under **Two hands**, choose a filter for the selected total. **Gestures** also has separate shared triangle/quad assignments. These save locally. An explicit manual shared-filter choice updates an open shared portal immediately.

Each hand can still operate its own independent 3/4-finger portal. A shared gesture can supersede a gathering local gesture, but it does not steal an already-open local portal: close existing local effects before forming a shared one.

The **One hand / Two hands** tabs select library/simulator previews; camera recognition always supports both automatically.

## Effects and controls

15 GPU effects: noir, thermal, simulated infrared, rainbow prism, psychedelic RGB, X-ray negative, digital glitch, holographic scan, liquid distortion, neon aurora, cosmic portal, Rainbow Dimension, advanced thermal, cyberpunk reality, and kaleidoscope.

Only the finger-defined polygon receives the filter. Outside pixels retain the source image apart from a short decorative edge glow. Feathering is inward only. WebGL2 is preferred; the Canvas fallback keeps localization with simplified processing.

Settings include mirror, tracking, markers, skeleton, contact distance, hold delay, sensitivity, closing threshold, intensity, glow, feathering, animation, particles, smoothing, and adaptive quality. Existing valid filter assignments migrate from v1; retired pair assignments are discarded permanently.

Screenshot saves the composited canvas as PNG. Record explicitly starts/stops a composited, silent video download using MediaRecorder. Recording also stops and saves when the camera stops or the page is hidden. Keyboard: C clear, F fullscreen, S screenshot, Escape close dialog.

## Test without a camera

Click **Explore without a camera**. Pick **One hand** or **Two hands** and **3 / 4 fingers total**. Use **Gather & open**, drag the labeled tips, adjust Spread, and use Close. H1 and H2 identify the separate simulated hands. The shared four-finger demo uses two cross-hand contact pairs. Synthetic 21-landmark inputs run through the same production gesture engine; the background is a live procedural canvas, not prerecorded video.

Open **http://127.0.0.1:5184/?diagnostics=1** for real GPU pixel tests, shared-gesture checks, and actual local model inference on a non-hand image. This page requests no webcam.

## Implementation and validation

React, TypeScript, Vite, Tailwind, MediaPipe Hand Landmarker, WebGL2/GLSL, and Canvas 2D. The typed classic worker runs inference off the UI thread, with GPU/CPU fallback. `importScripts` is required by the MediaPipe loader, so `scripts/build-worker.mjs` compiles the worker before dev/build.

`src/core/gestures.ts` owns contact, reservation, shared-hand arbitration, locked identities, and the gather → armed → opening → active → closing lifecycle. Contact distances use palm scale. Shared contact uses projected aspect-corrected xy, because MediaPipe z values have separate wrist-relative origins for each hand. RGB contact is an inferred proximity, not a physical touch sensor.

`src/tracking/identity.ts` associates up to two hands using motion and handedness. `geometry.ts` maintains unique vertex IDs, consistent winding, and simple polygons. The renderer masks strictly to the polygon, includes markers in capture, and reduces quality when needed. The displayed confidence is MediaPipe's handedness classification score, not per-landmark confidence.

**364/364 unit tests, 27/27 browser diagnostics, and the production build passed.** See `VALIDATION.md`. Physical webcam acceptance with real hands remains manual, including lighting, occlusion, rotations, crossings, and hardware FPS. Heavy hand overlap can still make identity estimation ambiguous.

Webcam permission is requested only after Start/Enable Camera; no microphone is requested. All image processing, settings, and recordings remain local. Thermal, infrared, and X-ray are artistic RGB simulations, not temperature, infrared, or anatomy measurements.

Primary references: [MediaPipe Hand Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js), [Vite](https://vite.dev/guide/). See `THIRD_PARTY_NOTICES.md` for upstream licensing.


Shared selection fix: Automatic by fingers is now the default. Different mixed-hand finger identities select different filters. Clicking a filter explicitly enables Manual filter override and immediately updates an open shared portal. Toggle Automatic by fingers to restore gesture-based selection, then gather/open again.


تایمر عکاسی: از Photo timer زمان ۳، ۵ یا ۱۰ ثانیه را انتخاب کنید و Take timed photo را بزنید. Off عکس فوری می‌گیرد. شمارش روی پیش‌نمایش نمایش داده می‌شود، ولی در عکس ذخیره نمی‌شود. Cancel photo یا Escape شمارش را لغو می‌کند. با خاموش شدن دوربین، تغییر حالت یا مخفی شدن صفحه نیز تایمر لغو می‌شود. خروجی PNG شامل تصویر و افکت‌هاست.
