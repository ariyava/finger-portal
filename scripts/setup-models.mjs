import { mkdir, cp, access, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import './build-worker.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await mkdir(path.join(root, 'public', 'models'), { recursive: true });
await mkdir(path.join(root, 'public', 'vendor'), { recursive: true });
await cp(path.join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'vision_bundle.js'), path.join(root, 'public', 'vendor', 'vision_bundle.js'));
await cp(path.join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm'), path.join(root, 'public', 'wasm'), { recursive: true });
const model = path.join(root, 'public', 'models', 'hand_landmarker.task');
try { await access(model); console.log('Local hand model and WASM are ready.'); }
catch {
  console.log('Downloading the official MediaPipe hand model (one-time setup)...');
  try {
    const response = await fetch('https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await writeFile(model, Buffer.from(await response.arrayBuffer()));
    console.log('Local hand model and WASM are ready.');
  } catch (error) {
    console.warn('Model download was unavailable. Run npm run setup:models when connected. Camera tracking needs this file; simulator works without it.');
    console.warn(error.message);
  }
}
