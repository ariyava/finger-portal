import type { Finger, Hand, Point, FingerRef, GestureScope } from './types';
import { TIP_IDS } from './types';

export class Simulator {
  fingers: Finger[] = [0, 1, 3];
  scope: GestureScope = 'single';
  sharedCount = 4;
  bridge = true;
  opening = 0;
  private autoAt = 0;
  private overrides = new Map<string, Point>();
  get participants(): FingerRef[] {
    if (this.scope === 'single') return this.fingers.map(finger => ({ handId: 99, finger }));
    return this.sharedCount === 3
      ? [{ handId: 99, finger: 0 }, { handId: 99, finger: 1 }, { handId: 100, finger: 1 }]
      : [{ handId: 99, finger: 0 }, { handId: 99, finger: 1 }, { handId: 100, finger: 0 }, { handId: 100, finger: 1 }];
  }
  select(fingers: Finger[], now: number, delay: number) {
    this.scope = 'single'; this.fingers = fingers; this.gather(now, delay);
  }
  selectShared(count: number, now: number, delay: number, bridge = true) {
    this.scope = 'shared'; this.sharedCount = count === 3 ? 3 : 4; this.bridge = bridge; this.gather(now, delay);
  }
  gather(now: number, delay: number) { this.opening = 0; this.autoAt = now + delay + 600; this.overrides.clear(); }
  close() { this.autoAt = 0; this.opening = 0; this.overrides.clear(); }
  setOpening(v: number) { this.autoAt = 0; this.opening = v; this.overrides.clear(); }
  drag(finger: number, p: Point, handId = 99) { this.autoAt = 0; this.overrides.set(`${handId}:${finger}`, p); }
  private updateTime(now: number) { if (this.autoAt && now >= this.autoAt) this.opening = Math.min(1, (now - this.autoAt) / 480); }
  private makeHand(id: number, tips: Map<Finger, Point>, side = 0): Hand {
    const x = side === 1 ? .22 : side === 2 ? .78 : .5;
    const landmarks: Point[] = Array.from({ length: 21 }, () => ({ x, y: .82, z: 0 }));
    landmarks[0] = { x, y: .96, z: 0 };
    for (let f = 0; f < 5; f++) {
      const tip = this.overrides.get(`${id}:${f}`) ?? tips.get(f as Finger)
        ?? { x: side === 1 ? .06 + f * .065 : side === 2 ? .68 + f * .065 : .13 + f * .17, y: .87, z: 0 };
      const base = { x: x - .12 + f * .06, y: .79 };
      for (let j = 0; j < 4; j++) landmarks[TIP_IDS[f] - 3 + j] = { x: base.x + (tip.x - base.x) * j / 3, y: base.y + (tip.y - base.y) * j / 3, z: 0 };
    }
    return { id, landmarks, confidence: 1, handedness: 'Simulated', aspect: 16 / 9 };
  }
  hand(now: number): Hand {
    this.updateTime(now);
    const shape = this.fingers.length === 3 ? [[.5, .23], [.28, .7], [.72, .7]] : [[.32, .28], [.68, .28], [.72, .7], [.28, .7]];
    const tips = new Map<Finger, Point>();
    this.fingers.forEach((f, i) => tips.set(f, { x: .5 + (shape[i][0] - .5) * this.opening + (1 - this.opening) * i * .002, y: .46 + (shape[i][1] - .46) * this.opening, z: 0 }));
    return this.makeHand(99, tips);
  }
  hands(now: number): Hand[] {
    if (this.scope === 'single') return [this.hand(now)];
    this.updateTime(now);
    const shape = this.sharedCount === 3 ? [[.27, .25], [.27, .75], [.75, .5]] : [[.27, .27], [.27, .73], [.73, .27], [.73, .73]];
    const tips = new Map<number, Map<Finger, Point>>([[99, new Map()], [100, new Map()]]);
    this.participants.forEach((m, i) => {
      const start = this.sharedCount === 4 && this.bridge ? { x: .5 + (i > 1 ? .002 : 0), y: i % 2 ? .7 : .3 } : { x: .5 + i * .002, y: .46 };
      tips.get(m.handId)!.set(m.finger, { x: start.x + (shape[i][0] - start.x) * this.opening, y: start.y + (shape[i][1] - start.y) * this.opening, z: 0 });
    });
    return [this.makeHand(99, tips.get(99)!, 1), this.makeHand(100, tips.get(100)!, 2)];
  }
}
export function drawSimulator(ctx: CanvasRenderingContext2D, time: number) {
  const { width: w, height: h } = ctx.canvas;
  const gradient = ctx.createRadialGradient(w * .5, h * .46, 0, w * .5, h * .46, w * .7);
  gradient.addColorStop(0, '#20352f'); gradient.addColorStop(.45, '#132524'); gradient.addColorStop(1, '#0c1219');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(124,179,155,.075)'; ctx.lineWidth = 1;
  const shift = (time * .003) % 32;
  for (let x = -32; x < w + 32; x += 32) { ctx.beginPath(); ctx.moveTo(x + shift, 0); ctx.lineTo(x + shift, h); ctx.stroke(); }
  for (let y = -32; y < h + 32; y += 32) { ctx.beginPath(); ctx.moveTo(0, y + shift); ctx.lineTo(w, y + shift); ctx.stroke(); }
  for (let i = 0; i < 65; i++) {
    const x = (Math.sin(i * 123.45) * .5 + .5) * w, y = (Math.cos(i * 38.63) * .5 + .5) * h;
    ctx.fillStyle = `rgba(190,225,201,${.12 + .12 * Math.sin(time * .0005 + i)})`; ctx.fillRect(x, y, 1.5, 1.5);
  }
  ctx.strokeStyle = 'rgba(184,227,191,.1)'; ctx.beginPath(); ctx.arc(w * .5, h * .46, h * .3, 0, Math.PI * 2); ctx.stroke();
  ctx.font = '11px monospace'; ctx.fillStyle = 'rgba(186,217,201,.24)'; ctx.fillText('SYNTHETIC INPUT / LIVE PROCEDURAL CANVAS', 24, h - 24);
}
