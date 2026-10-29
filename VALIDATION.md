# Validation — filter-only and shared-hand release

Validated on 29 October 2026 (Asia/Dubai), with Node 24 and the in-app Chromium browser.

- **359/359 unit tests passed.** Includes all 15 retained single-hand combinations, rejection of every retired two-finger pair, shared contact using all **100 mixed-hand triples and 200 mixed-hand quads**, complete activation/closing, paired thumb/index contact, unique hand+finger identities, stable input-order association, fixed active mappings, shared ownership, loss of either hand, polygon geometry, scale normalization, settings migration, and shared customization.
- **27/27 browser diagnostics passed** on the compiled production build. All 15 retained GLSL filters produced distinct output, far-outside source pixels remained unchanged, mirror/cleanup checks passed, and shared triangle/quad cluster and paired-contact inputs produced exactly one connected bounded portal. Two-finger activation was rejected. PNG encoding, recording APIs, and actual local MediaPipe worker inference passed.
- **Production TypeScript/Vite build passed.** No dependency changes were needed for this update.
- The UI exposes only three/four-finger gesture sizes, includes One hand / Two hands previews and configurable shared filters, and identifies both owners of an active shared portal.
- Browser testing changed the shared four-finger assignment to Kaleidoscope, reloaded, and verified the persisted value. It was restored to Rainbow Dimension afterward.

Reproduce with `npm test`, `npm run build`, and `/?diagnostics=1` while serving the build. The original release also completed real PNG/WebM download checks; recording/capture code remains the same in this update.

## Manual acceptance still required

No real person's webcam frames were captured during validation. Test actual three/four-finger interaction on one hand, a 2+1 shared triangle, 2+2 or 3+1 shared quad, and thumb-to-thumb/index-to-index paired contact under the target lighting and camera. Confirm correct attachment, inside-only filtering, closure and one-hand-loss cleanup. Real occlusion, rotations, hand crossing, and hardware frame rates remain manual checks.

MediaPipe depth is relative to each hand's wrist, so shared contact intentionally uses projected xy normalized by both palm sizes. A normal RGB webcam cannot certify physical touch. Thermal/infrared/X-ray remain artistic simulations.


## Shared selection regression fix

364/364 tests and the production build passed. New regressions cover automatic selection across ten matching finger pairs, canonical hand-order invariance, old rainbow-only settings, manual overrides, and intentional live changes without replacing finger identities. Browser simulation confirmed automatic Noir for thumb/index on both hands and explicit Holographic Scan selection. Physical webcam confirmation remains manual.


## Timed photography

368/368 tests and production build passed. Countdown tests cover one capture at deadline, cancellation, replacement, and immediate mode. Browser simulation completed a three-second timed PNG download, displayed a ten-second countdown, and verified cancellation removed it. Timers cancel on mode changes, hidden tabs, Escape and unmount. Countdown UI is outside the captured canvas.
