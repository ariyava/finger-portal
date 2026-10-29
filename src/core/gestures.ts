import type { Hand, Gesture, FingerRef, Settings, Point } from './types';
import { TIP_IDS } from './types';
import { combinations, mappedEffect, comboKey, sharedEffect } from './effects';
import { spread, center, orderPolygon, palmScale } from './geometry';

export const LOSS_GRACE_MS = 180;
export const FADE_MS = 220;
type Candidate = Pick<Gesture, 'id' | 'scope' | 'handIds' | 'members' | 'contactPairs'> & { score: number };
const committed = (g: Gesture) => ['OPENING', 'ACTIVE', 'CLOSING'].includes(g.state);
const memberKey = (m: FingerRef) => `${m.handId}:${m.finger}`;

function rawPoints(members: FingerRef[], hands: Map<number, Hand>): Point[] {
  return members.map(m => ({ ...hands.get(m.handId)!.landmarks[TIP_IDS[m.finger]], id: m.handId * 5 + m.finger }));
}
function sharedDistance(members: FingerRef[], hands: Map<number, Hand>, pairs?: [number, number][]) {
  const ps = rawPoints(members, hands);
  const owners = [...new Set(members.map(m => m.handId))].map(id => hands.get(id)!);
  const scale = owners.reduce((sum, h) => sum + palmScale(h), 0) / owners.length;
  const aspect = owners[0].aspect;
  // MediaPipe z is relative to each hand's own wrist. Shared contact must use xy.
  const distance = (i: number, j: number) => Math.hypot((ps[i].x - ps[j].x) * aspect, ps[i].y - ps[j].y) / scale;
  if (pairs) return Math.max(...pairs.map(([i, j]) => distance(i, j)));
  let max = 0;
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) max = Math.max(max, distance(i, j));
  return max;
}
function measure(g: Pick<Gesture, 'scope' | 'members' | 'contactPairs'>, hands: Map<number, Hand>) {
  return g.scope === 'shared' ? sharedDistance(g.members, hands, g.contactPairs) : spread(hands.get(g.members[0].handId)!, g.members.map(m => m.finger));
}
function singleCandidate(hand: Hand, contact: number): Candidate | undefined {
  for (const size of [4, 3]) {
    const candidates = combinations(size).map(fingers => ({ fingers, score: spread(hand, fingers) }))
      .filter(c => c.score <= contact).sort((a, b) => a.score - b.score || comboKey(a.fingers).localeCompare(comboKey(b.fingers)));
    const best = candidates[0];
    if (best) return { id: `single:${hand.id}`, scope: 'single', handIds: [hand.id], members: best.fingers.map(finger => ({ handId: hand.id, finger })), score: best.score };
  }
}
function sharedCandidate(available: Hand[], contact: number): Candidate | undefined {
  if (available.length !== 2) return;
  const [a, b] = [...available].sort((a, b) => a.id - b.id);
  const hands = new Map([[a.id, a], [b.id, b]]);
  for (const size of [4, 3]) {
    const candidates: Candidate[] = [];
    for (let left = 1; left < size; left++) {
      for (const af of combinations(left)) for (const bf of combinations(size - left)) {
        const members = [...af.map(finger => ({ handId: a.id, finger })), ...bf.map(finger => ({ handId: b.id, finger }))];
        let score = sharedDistance(members, hands);
        let contactPairs: [number, number][] | undefined;
        // Four tips can meet in one cluster or in two cross-hand contacts,
        // e.g. thumb-to-thumb plus index-to-index. Freeze the matching at gather.
        if (left === 2 && size === 4) {
          for (const pairs of [[[0, 2], [1, 3]], [[0, 3], [1, 2]]] as [number, number][][]) {
            const paired = sharedDistance(members, hands, pairs);
            if (paired < score || (paired === score && !contactPairs)) { score = paired; contactPairs = pairs; }
          }
        }
        if (score <= contact) candidates.push({ id: `shared:${a.id}:${b.id}`, scope: 'shared', handIds: [a.id, b.id], members, contactPairs, score });
      }
    }
    candidates.sort((a, b) => a.score - b.score || a.members.map(memberKey).join('|').localeCompare(b.members.map(memberKey).join('|')));
    if (candidates[0]) return candidates[0];
  }
}

export class GestureEngine {
  gestures = new Map<string, Gesture>();
  private cooldown = new Map<number, number>();
  clear() { this.gestures.clear(); this.cooldown.clear(); }
  setSharedEffect(effect: number, count?: number) {
    for (const g of this.gestures.values()) if (g.scope === 'shared' && (!count || g.members.length === count)) g.effect = effect;
  }
  update(input: Hand[], now: number, s: Settings): Gesture[] {
    const hands = new Map(input.map(h => [h.id, h]));
    const contact = s.contactDistance * s.sensitivity;
    const open = Math.max(contact * 2.1, contact * s.releaseSensitivity + .12);
    const close = contact * s.releaseSensitivity;
    for (const [id, until] of this.cooldown) if (until < now) this.cooldown.delete(id);
    const create = (c: Candidate): Gesture => {
      const points = orderPolygon(rawPoints(c.members, hands));
      const fingers = c.members.map(m => m.finger);
      return { ...c, handId: c.handIds[0], fingers, effect: c.scope === 'shared' ? sharedEffect(c.members, s) : mappedEffect(fingers, s.mappings), state: 'FINGERS_GATHERED', points, origin: center(points), opacity: 0, since: now, lastSeen: now };
    };
    // Shared portals own both hands until fully dissolved. They may supersede
    // gathering local gestures, but never steal an already-open local portal.
    const busy = new Set([...this.gestures.values()].filter(committed).flatMap(g => g.handIds));
    const available = input.filter(h => !busy.has(h.id) && !this.cooldown.has(h.id));
    const shared = sharedCandidate(available, contact);
    if (shared) {
      const current = this.gestures.get(shared.id);
      if (!current) {
        for (const [id, g] of this.gestures) if (!committed(g) && g.handIds.some(id => shared.handIds.includes(id))) this.gestures.delete(id);
        this.gestures.set(shared.id, create(shared));
      } else if (shared.members.length > current.members.length && current.members.every(m => shared.members.some(n => memberKey(m) === memberKey(n)))) this.gestures.set(shared.id, create(shared));
    }
    for (const hand of input) {
      if (this.cooldown.has(hand.id)) continue;
      const owned = [...this.gestures.values()].find(g => g.handIds.includes(hand.id));
      if (owned?.scope === 'shared' || (owned && committed(owned))) continue;
      const candidate = singleCandidate(hand, contact);
      if (!candidate) continue;
      if (!owned || (candidate.members.length > owned.members.length && owned.members.every(m => candidate.members.some(n => memberKey(m) === memberKey(n))))) this.gestures.set(candidate.id, create(candidate));
    }
    for (const [id, g] of this.gestures) {
      const seen = g.handIds.every(id => hands.has(id));
      if (!seen) {
        if (now - g.lastSeen > LOSS_GRACE_MS && g.state !== 'CLOSING') {
          if (g.state === 'FINGERS_GATHERED' || g.state === 'ARMED') { this.gestures.delete(id); continue; }
          g.closingFrom = g.opacity; g.state = 'CLOSING'; g.since = now;
        }
      } else if (g.state !== 'CLOSING') {
        g.lastSeen = now;
        g.points = orderPolygon(rawPoints(g.members, hands));
        const d = measure(g, hands);
        switch (g.state) {
          case 'FINGERS_GATHERED':
            if (d > contact * 1.45) { this.gestures.delete(id); continue; }
            if (now - g.since >= s.activationDelay + (g.members.length === 3 ? 120 : 0)) { g.state = 'ARMED'; g.since = now; g.origin = center(g.points); }
            break;
          case 'ARMED':
            if (d > open) { g.state = 'OPENING'; g.since = now; }
            break;
          case 'OPENING':
            g.opacity = Math.min(1, (now - g.since) / 160);
            if (d < close) { g.closingFrom = g.opacity; g.state = 'CLOSING'; g.since = now; }
            else if (g.opacity >= 1) { g.state = 'ACTIVE'; g.since = now; }
            break;
          case 'ACTIVE':
            g.opacity = 1;
            if (d < close) { g.closingFrom = g.opacity; g.state = 'CLOSING'; g.since = now; }
            break;
        }
      }
      if (g.state === 'CLOSING') {
        g.opacity = (g.closingFrom ?? 1) * Math.max(0, 1 - (now - g.since) / FADE_MS);
        if (now - g.since >= FADE_MS) { this.gestures.delete(id); g.handIds.forEach(id => this.cooldown.set(id, now + 180)); }
      }
    }
    return [...this.gestures.values()];
  }
}
