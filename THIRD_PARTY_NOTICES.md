# Third-party notices

Finger Portal uses the following open-source dependencies. Exact dependency versions and package integrity hashes are recorded in `package-lock.json`.

- React and React DOM — MIT — https://github.com/facebook/react
- Vite and its React integration — MIT — https://github.com/vitejs/vite
- TypeScript — Apache-2.0 — https://github.com/microsoft/TypeScript
- Tailwind CSS — MIT — https://github.com/tailwindlabs/tailwindcss
- Lucide icons — ISC — https://github.com/lucide-icons/lucide
- MediaPipe Tasks Vision — Apache-2.0 — https://github.com/google-ai-edge/mediapipe
- Vitest — MIT — https://github.com/vitest-dev/vitest

The unmodified MediaPipe JavaScript/WASM runtime is copied from the installed official `@mediapipe/tasks-vision` package. The hand model is the official `hand_landmarker/float16/1/hand_landmarker.task` from Google's MediaPipe model storage. Upstream copyright and licensing terms continue to apply. Package installations retain upstream license files in `node_modules`.
