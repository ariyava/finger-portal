import { describe, it, expect } from 'vitest';
import { GestureEngine, LOSS_GRACE_MS, FADE_MS } from '../src/core/gestures';
import { Simulator } from '../src/core/simulator';
import { combinations, sharedKey } from '../src/core/effects';
import { sanitizeSettings, loadSettings, STORAGE_KEY } from '../src/core/settings';
import { TIP_IDS } from '../src/core/types';
import type { FingerRef, Hand, Point } from '../src/core/types';
import { signedArea } from '../src/core/geometry';

const settings = sanitizeSettings({sharedAuto:false});
function syntheticHand(id: number): Hand {
  const base = id === 10 ? .18 : .82;
  const landmarks: Point[] = Array.from({ length: 21 }, () => ({ x: base, y: .8, z: 0 }));
  landmarks[0] = { x: base, y: .96, z: 0 };
  landmarks[9] = { x: base, y: .71, z: 0 };
  landmarks[5] = { x: base - .12, y: .79, z: 0 };
  landmarks[17] = { x: base + .12, y: .79, z: 0 };
  for (let f = 0; f < 5; f++) landmarks[TIP_IDS[f]] = { x: id === 10 ? .01 + f * .045 : .80 + f * .04, y: .03 + f * .12, z: 0 };
  return { id, landmarks, aspect: 16 / 9, confidence: .98, handedness: id === 10 ? 'Left' : 'Right' };
}
function sharedHands(members: FingerRef[], opened: boolean, paired = false): Hand[] {
  const hands = [syntheticHand(10), syntheticHand(20)];
  const shape = members.length === 3 ? [[.3, .23], [.28, .75], [.75, .5]] : [[.25, .24], [.25, .76], [.75, .24], [.75, .76]];
  members.forEach((m, i) => {
    const p = opened ? { x: shape[i][0], y: shape[i][1], z: 0 } : { x: .5 + i * .0001, y: paired ? (i % 2 ? .7 : .3) : .48, z: 0 };
    hands.find(h => h.id === m.handId)!.landmarks[TIP_IDS[m.finger]] = p;
  });
  return hands;
}
function open(engine: GestureEngine, members: FingerRef[], paired = false) {
  engine.update(sharedHands(members, false, paired), 0, settings);
  engine.update(sharedHands(members, false, paired), 1000, settings);
  engine.update(sharedHands(members, true), 1100, settings);
  return engine.update(sharedHands(members, true), 1300, settings);
}
const groups: FingerRef[][] = [];
for (const size of [3, 4]) for (let left = 1; left < size; left++) {
  for (const a of combinations(left)) for (const b of combinations(size - left)) groups.push([...a.map(finger => ({ handId: 10, finger })), ...b.map(finger => ({ handId: 20, finger }))]);
}
const four: FingerRef[] = [{ handId: 10, finger: 0 }, { handId: 10, finger: 1 }, { handId: 20, finger: 0 }, { handId: 20, finger: 1 }];

describe('all mixed-hand combinations', () => {
  it('covers 100 triples and 200 quads across both hands', () => {
    expect(groups.filter(g => g.length === 3)).toHaveLength(100);
    expect(groups.filter(g => g.length === 4)).toHaveLength(200);
  });
  for (const members of groups) it(`opens and closes ${members.map(m => `${m.handId}:${m.finger}`).join('|')}`, () => {
    const engine = new GestureEngine();
    const result = open(engine, members);
    expect(result).toHaveLength(1);
    const g = result[0];
    expect(g.scope).toBe('shared'); expect(g.state).toBe('ACTIVE'); expect(g.members).toEqual(members);
    expect(g.handIds).toEqual([10, 20]); expect(g.effect).toBe(settings.mappings[sharedKey(members.length)]);
    expect(new Set(g.points.map(p => p.id)).size).toBe(members.length); expect(signedArea(g.points)).toBeGreaterThan(0);
    expect(engine.update(sharedHands(members, false), 1400, settings)[0].state).toBe('CLOSING');
    expect(engine.update([], 1400 + FADE_MS, settings)).toEqual([]);
  });
});
describe('two-hand contact and ownership', () => {
  it('arms separate thumb-to-thumb and index-to-index contacts before opening a quad', () => {
    const result = open(new GestureEngine(), four, true);
    expect(result[0].state).toBe('ACTIVE'); expect(result[0].contactPairs).toEqual([[0, 2], [1, 3]]);
  });
  it('supports two fingers on each hand while never enabling a two-finger effect', () => {
    const engine = new GestureEngine();
    const pair: FingerRef[] = [{ handId: 10, finger: 1 }, { handId: 20, finger: 1 }];
    const hands = sharedHands(pair, false);
    expect(engine.update(hands, 0, settings)).toEqual([]); expect(engine.update(hands, 2000, settings)).toEqual([]);
  });
  it('never steals an already active local portal when the second hand arrives', () => {
    const engine = new GestureEngine(), sim = new Simulator(); sim.select([0, 1, 2], 0, 260); sim.setOpening(0);
    engine.update(sim.hands(0), 0, settings); engine.update(sim.hands(1000), 1000, settings); sim.setOpening(1);
    engine.update(sim.hands(1100), 1100, settings); const before = engine.update(sim.hands(1300), 1300, settings)[0];
    const other = { ...sim.hand(1400), id: 100 };
    const after = engine.update([sim.hand(1400), other], 1400, settings).find(g => g.id === before.id)!;
    expect(after.scope).toBe('single'); expect(after.members).toEqual(before.members); expect(after.state).toBe('ACTIVE');
  });
  it('keeps one shared portal and locked identities through input ordering and mapping changes', () => {
    const engine = new GestureEngine(); open(engine, four, true);
    const changed = { ...settings, mappings: { ...settings.mappings, 'shared-4': 10 } };
    for (let t = 1400; t < 2000; t += 50) {
      const result = engine.update(sharedHands(four, true).reverse(), t, changed);
      expect(result).toHaveLength(1); expect(result[0].members).toEqual(four); expect(result[0].effect).toBe(21);
    }
  });
  it('does not compare the unrelated relative z origins of different hands', () => {
    const engine = new GestureEngine(), hands = sharedHands(four, false, true);
    hands[1].landmarks.forEach(p => { p.z = (p.z ?? 0) + 5; });
    expect(engine.update(hands, 0, settings)[0].scope).toBe('shared');
    expect(engine.update(hands, 1000, settings)[0].state).toBe('ARMED');
  });
  it('fades and clears when either participating hand disappears', () => {
    const engine = new GestureEngine(); open(engine, four, true);
    const one = sharedHands(four, true).slice(0, 1);
    expect(engine.update(one, 1300 + LOSS_GRACE_MS - 1, settings)[0].state).toBe('ACTIVE');
    expect(engine.update(one, 1300 + LOSS_GRACE_MS + 1, settings)[0].state).toBe('CLOSING');
    expect(engine.update(one, 1300 + LOSS_GRACE_MS + FADE_MS + 2, settings)).toEqual([]);
  });
  it('does not rearm when only an open shape is visible without contact', () => {
    const engine = new GestureEngine(); expect(engine.update(sharedHands(four, true), 0, settings)).toEqual([]);
  });
  it('simulates both clustered and paired four-finger contact through the production engine', () => {
    for (const count of [3, 4]) for (const paired of [false, true]) {
      const sim = new Simulator(), engine = new GestureEngine(); sim.selectShared(count, 0, 260, paired); sim.setOpening(0);
      engine.update(sim.hands(0), 0, settings); expect(engine.update(sim.hands(1000), 1000, settings)[0].state).toBe('ARMED');
      sim.setOpening(1); engine.update(sim.hands(1100), 1100, settings);
      expect(engine.update(sim.hands(1300), 1300, settings)[0].state).toBe('ACTIVE');
    }
  });
  it('migrates v1 filter mappings while permanently dropping retired pair assignments', () => {
    const old = { mappings: { '0-1': 0, '1-2-3': 13 }, intensity: .62 };
    const loaded = loadSettings({ getItem: key => key === 'finger-portal.settings.v1' ? JSON.stringify(old) : null });
    expect(loaded.mappings['0-1']).toBeUndefined(); expect(loaded.mappings['1-2-3']).toBe(13);
    expect(loaded.mappings['shared-4']).toBe(21); expect(loaded.intensity).toBe(.62); expect(STORAGE_KEY).toContain('v2');
  });
  it('persists independently customizable shared triangle and quad mappings', () => {
    const next = sanitizeSettings({ mappings: { 'shared-3': 17, 'shared-4': 24, '0-1': 9 } });
    expect(next.mappings['shared-3']).toBe(17); expect(next.mappings['shared-4']).toBe(24); expect(next.mappings['0-1']).toBeUndefined();
  });
});
