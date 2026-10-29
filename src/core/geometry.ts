import type { Point, Finger, Hand } from './types';
import { TIP_IDS } from './types';
export const distance = (a: Point, b: Point, aspect = 1) => Math.hypot((a.x - b.x) * aspect, a.y - b.y, ((a.z ?? 0) - (b.z ?? 0)) * aspect);
export const center = (ps: Point[]): Point => ({ x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length });
export const mirrorPoint = (p: Point, mirror: boolean): Point => ({ ...p, x: mirror ? 1 - p.x : p.x });
export const palmScale = (hand: Hand) => Math.max(.025, (distance(hand.landmarks[0], hand.landmarks[9], hand.aspect) + distance(hand.landmarks[5], hand.landmarks[17], hand.aspect)) / 2);
export const fingertips = (hand: Hand, fingers: Finger[]) => fingers.map(f => ({ ...hand.landmarks[TIP_IDS[f]], id: f }));
export function spread(hand: Hand, fingers: Finger[]) {
  const ps = fingertips(hand, fingers);
  let max = 0;
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) max = Math.max(max, distance(ps[i], ps[j], hand.aspect));
  return max / palmScale(hand);
}
export function signedArea(ps: Point[]) {
  return ps.reduce((s, p, i) => { const q = ps[(i + 1) % ps.length]; return s + p.x * q.y - q.x * p.y; }, 0) / 2;
}
// Polar ordering is simple even when a fourth point is inside the triangle.
// Stable landmark IDs anchor the starting vertex; winding never changes.
export function orderPolygon(ps: Point[]): Point[] {
  if (ps.length < 3) return ps;
  const c = center(ps);
  let ordered = [...ps].sort((a, b) => Math.atan2(a.y - c.y, a.x - c.x) - Math.atan2(b.y - c.y, b.x - c.x) || (a.id ?? 0) - (b.id ?? 0));
  if (signedArea(ordered) < 0) ordered.reverse();
  const start = ordered.reduce((best, p, i) => (p.id ?? i) < (ordered[best].id ?? best) ? i : best, 0);
  ordered = [...ordered.slice(start), ...ordered.slice(0, start)];
  return ordered;
}
export function pointInPolygon(p: Point, ps: Point[]) {
  let inside = false;
  for (let i = 0, j = ps.length - 1; i < ps.length; j = i++) {
    const a = ps[i], b = ps[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
export function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
