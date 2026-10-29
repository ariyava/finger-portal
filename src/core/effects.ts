import type { Finger, FingerRef, Settings } from './types';
export const FILTER_EFFECTS = [
  { id: 10, name: 'Black & white noir', color: '#d8dce8', group: 'filter', note: 'Cinematic contrast. A different perspective.' },
  { id: 11, name: 'Thermal vision', color: '#ffa072', group: 'filter', note: 'Luminance remapped into simulated heat.' },
  { id: 12, name: 'Infrared vision', color: '#b3ed8b', group: 'filter', note: 'An artificial night-vision aesthetic.' },
  { id: 13, name: 'Rainbow prism', color: '#d4a8ff', group: 'filter', note: 'Spectral refraction, inside your hands.' },
  { id: 14, name: 'Psychedelic RGB', color: '#ff8ad5', group: 'filter', note: 'Liquid hues and chromatic separation.' },
  { id: 15, name: 'X-ray negative', color: '#a8e4ff', group: 'filter', note: 'A cool negative. A visual effect, not anatomy.' },
  { id: 16, name: 'Digital glitch', color: '#b9f882', group: 'filter', note: 'A carefully controlled break in reality.' },
  { id: 17, name: 'Holographic scan', color: '#7be8f9', group: 'filter', note: 'Cyan scanlines across a luminous surface.' },
  { id: 18, name: 'Liquid distortion', color: '#86d9e7', group: 'filter', note: 'Color becomes a flowing material.' },
  { id: 19, name: 'Neon aurora', color: '#a6f3cc', group: 'filter', note: 'Soft curtains of otherworldly light.' },
  { id: 20, name: 'Cosmic portal', color: '#ba9df8', group: 'portal', note: 'A small opening into a much larger universe.' },
  { id: 21, name: 'Rainbow dimension', color: '#e9bdff', group: 'portal', note: 'Refract reality into an infinite spectrum.' },
  { id: 22, name: 'Advanced thermal', color: '#ffc46e', group: 'portal', note: 'Simulated heat with a liquid shimmer.' },
  { id: 23, name: 'Cyberpunk reality', color: '#90f3d4', group: 'portal', note: 'Neon interference from another future.' },
  { id: 24, name: 'Kaleidoscope', color: '#d2a8fc', group: 'portal', note: 'Mirrored worlds, unfolding in your fingers.' },
] as const;
export const EFFECTS = Object.fromEntries(FILTER_EFFECTS.map(e => [e.id, e])) as Record<number, typeof FILTER_EFFECTS[number]>;

export function combinations(size: number): Finger[][] {
  const result: Finger[][] = [];
  const walk = (start: number, list: Finger[]) => {
    if (list.length === size) { result.push(list); return; }
    for (let i = start; i < 5; i++) walk(i + 1, [...list, i as Finger]);
  };
  walk(0, []); return result;
}
export const ALL_COMBINATIONS = [3, 4].flatMap(combinations);
export const comboKey = (fingers: readonly Finger[]) => [...fingers].sort().join('-');
export const sharedKey = (count: number) => `shared-${count}`;
export function sharedEffect(members: FingerRef[], settings: Pick<Settings, 'sharedAuto' | 'mappings'>): number {
  if (!settings.sharedAuto) return settings.mappings[sharedKey(members.length)];
  const groups = new Map<number, Finger[]>();
  for (const m of members) groups.set(m.handId, [...(groups.get(m.handId) ?? []), m.finger]);
  // Canonicalize finger identities independently of detector order and hand IDs.
  const keys = [...groups.values()].map(comboKey).sort();
  if (keys.length === 2 && keys[0] === keys[1] && keys[0].split('-').length === 2) {
    return 10 + combinations(2).findIndex(pair => comboKey(pair) === keys[0]);
  }
  const key = keys.join('|');
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return FILTER_EFFECTS[hash % FILTER_EFFECTS.length].id;
}
export const DEFAULT_MAPPINGS: Record<string, number> = {
  ...Object.fromEntries(ALL_COMBINATIONS.map((c, i) => [comboKey(c), i + 10])),
  'shared-3': 11,
  'shared-4': 21,
};
export function mappedEffect(fingers: Finger[], mappings: Record<string, number>) {
  if (fingers.length !== 3 && fingers.length !== 4) throw new RangeError('Portals require three or four fingertips.');
  const key = comboKey(fingers);
  return mappings[key] ?? DEFAULT_MAPPINGS[key];
}
