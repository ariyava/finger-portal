import { DEFAULT_MAPPINGS } from './effects';
import type { Settings } from './types';
export const STORAGE_KEY = 'finger-portal.settings.v2';
export const DEFAULT_SETTINGS: Settings = {
  sharedAuto: true,
  mirror: true, tracking: true, markers: true, skeleton: false,
  sensitivity: 1, contactDistance: .34, activationDelay: 260, releaseSensitivity: 1.25,
  intensity: .9, glow: .65, feather: .012, speed: .8, particles: .5,
  smoothing: .45, quality: 'auto', mappings: { ...DEFAULT_MAPPINGS },
};
const ranges: Partial<Record<keyof Settings, [number, number]>> = {
  sensitivity: [.6, 1.6], contactDistance: [.12, .65], activationDelay: [100, 1000],
  releaseSensitivity: [1, 1.7], intensity: [0, 1], glow: [0, 1.5], feather: [.001, .05],
  speed: [.1, 2], particles: [0, 1], smoothing: [0, .85],
};
export function sanitizeSettings(input: unknown): Settings {
  const s: Settings = { ...DEFAULT_SETTINGS, mappings: { ...DEFAULT_MAPPINGS } };
  if (!input || typeof input !== 'object') return s;
  const v = input as Record<string, unknown>;
  for (const key of ['sharedAuto', 'mirror', 'tracking', 'markers', 'skeleton'] as const) if (typeof v[key] === 'boolean') s[key] = v[key];
  for (const [key, range] of Object.entries(ranges)) {
    const value = v[key];
    if (typeof value === 'number' && Number.isFinite(value)) (s as unknown as Record<string, unknown>)[key] = Math.max(range[0], Math.min(range[1], value));
  }
  if (['auto', 'high', 'medium', 'low'].includes(v.quality as string)) s.quality = v.quality as Settings['quality'];
  if (v.mappings && typeof v.mappings === 'object') for (const key of Object.keys(DEFAULT_MAPPINGS)) {
    const effect = (v.mappings as Record<string, unknown>)[key];
    if (typeof effect === 'number' && Number.isInteger(effect) && effect >= 10 && effect <= 24) s.mappings[key] = effect;
  }
  return s;
}
export function loadSettings(storage: Pick<Storage, 'getItem'> = localStorage) {
  try { return sanitizeSettings(JSON.parse(storage.getItem(STORAGE_KEY) ?? storage.getItem('finger-portal.settings.v1') ?? '{}')); } catch { return sanitizeSettings({}); }
}
export function saveSettings(s: Settings, storage: Pick<Storage, 'setItem'> = localStorage): boolean {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(sanitizeSettings(s))); return true; } catch { return false; }
}
