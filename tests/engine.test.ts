import { describe, it, expect } from 'vitest';
import { ALL_COMBINATIONS, DEFAULT_MAPPINGS, mappedEffect, comboKey, combinations } from '../src/core/effects';
import { GestureEngine, LOSS_GRACE_MS, FADE_MS } from '../src/core/gestures';
import { Simulator } from '../src/core/simulator';
import { DEFAULT_SETTINGS, sanitizeSettings, loadSettings, saveSettings, STORAGE_KEY } from '../src/core/settings';
import { mirrorPoint, orderPolygon, signedArea, pointInPolygon, spread } from '../src/core/geometry';
import { HandIdentityTracker } from '../src/tracking/identity';
import type { Finger, Hand } from '../src/core/types';
const s=sanitizeSettings(DEFAULT_SETTINGS);
function fixture(fingers:Finger[]) {const sim=new Simulator();sim.select(fingers,0,s.activationDelay);sim.close();return sim;}
function activate(engine:GestureEngine,sim:Simulator,start=0) {
  sim.setOpening(0);engine.update([sim.hand(start)],start,s);engine.update([sim.hand(start+1000)],start+1000,s);
  sim.setOpening(1);engine.update([sim.hand(start+1100)],start+1100,s);return engine.update([sim.hand(start+1300)],start+1300,s);
}
describe('15 single-hand portal combinations',()=>{
  it('contains only 10 triples and 5 quads plus two shared mappings',()=>{
    expect(ALL_COMBINATIONS).toHaveLength(15);expect(ALL_COMBINATIONS.every(c=>c.length>=3)).toBe(true);
    expect(Object.keys(DEFAULT_MAPPINGS)).toHaveLength(17);expect(new Set(Object.values(DEFAULT_MAPPINGS)).size).toBe(15);
  });
  for(const pair of combinations(2)) it(`never activates removed pair ${comboKey(pair)}`,()=>{
    const engine=new GestureEngine(),sim=fixture(pair);
    for(const time of [0,1000,2000])expect(engine.update([sim.hand(time)],time,s)).toEqual([]);
    sim.setOpening(1);expect(engine.update([sim.hand(2200)],2200,s)).toEqual([]);
    expect(DEFAULT_MAPPINGS[comboKey(pair)]).toBeUndefined();
  });
  for(const fingers of ALL_COMBINATIONS) it(`recognizes, arms, activates and closes ${comboKey(fingers)}`,()=>{
    const engine=new GestureEngine(),sim=fixture(fingers);
    expect(engine.update([sim.hand(0)],0,s)[0].state).toBe('FINGERS_GATHERED');
    expect(engine.update([sim.hand(1000)],1000,s)[0].state).toBe('ARMED');
    sim.setOpening(1);
    expect(engine.update([sim.hand(1100)],1100,s)[0].state).toBe('OPENING');
    const g=engine.update([sim.hand(1300)],1300,s)[0];
    expect(g.state).toBe('ACTIVE');expect(g.fingers).toEqual(fingers);expect(g.effect).toBe(DEFAULT_MAPPINGS[comboKey(fingers)]);
    sim.setOpening(0);expect(engine.update([sim.hand(1400)],1400,s)[0].state).toBe('CLOSING');
    expect(engine.update([sim.hand(1400+FADE_MS)],1400+FADE_MS,s)).toHaveLength(0);
  });
});
describe('state stability and priority',()=>{
  it('does not activate on separated fingers without gathering',()=>{
    const e=new GestureEngine(),sim=fixture([0,1,3]);sim.setOpening(1);expect(e.update([sim.hand(0)],0,s)).toEqual([]);
  });
  it('rejects a brief contact',()=>{
    const e=new GestureEngine(),sim=fixture([0,1,3]);e.update([sim.hand(0)],0,s);sim.setOpening(1);
    expect(e.update([sim.hand(100)],100,s)).toEqual([]);
  });
  it('prioritizes four over triples at recognition',()=>{
    const e=new GestureEngine(),sim=fixture([0,1,2,4]);expect(e.update([sim.hand(0)],0,s)[0].fingers).toEqual([0,1,2,4]);
  });
  it('lets a gathering triple upgrade to a quad',()=>{
    const e=new GestureEngine(),sim=fixture([0,1,2]);e.update([sim.hand(0)],0,s);
    sim.select([0,1,2,3],100,s.activationDelay);expect(e.update([sim.hand(100)],100,s)[0].fingers).toHaveLength(4);
    expect(e.update([sim.hand(250)],250,s)[0].state).toBe('FINGERS_GATHERED');
  });
  it('reserves time for a fourth finger while gathering a triple',()=>{
    const e=new GestureEngine(),sim=fixture([0,1,2]);e.update([sim.hand(0)],0,s);
    expect(e.update([sim.hand(300)],300,s)[0].state).toBe('FINGERS_GATHERED');
    expect(e.update([sim.hand(500)],500,s)[0].state).toBe('ARMED');
  });
  it('preserves exact active finger IDs and mapping despite settings changes',()=>{
    const e=new GestureEngine(),sim=fixture([0,1,3]);activate(e,sim);
    const changed={...s,mappings:{...s.mappings,'0-1-3':13}};
    for(let time=1400;time<3000;time+=30){const g=e.update([sim.hand(time)],time,changed)[0];expect(g.effect).toBe(11);expect(g.fingers).toEqual([0,1,3]);expect(g.state).toBe('ACTIVE');}
  });
  it('allows independent active effects on both hands',()=>{
    const e=new GestureEngine(),a=fixture([0,1,2]),b=fixture([0,1,3]);
    const hands=(time:number)=>[{...a.hand(time),id:1,landmarks:a.hand(time).landmarks.map(p=>({...p,x:p.x*.4}))},{...b.hand(time),id:2,landmarks:b.hand(time).landmarks.map(p=>({...p,x:.6+p.x*.4}))}];
    e.update(hands(0),0,s);e.update(hands(1000),1000,s);a.setOpening(1);b.setOpening(1);
    e.update(hands(1100),1100,s);const gs=e.update(hands(1300),1300,s);
    expect(gs.map(g=>g.effect).sort((a,b)=>a-b)).toEqual([10,11]);
  });
  it('tolerates brief tracking loss, then fades and removes the effect',()=>{
    const e=new GestureEngine(),sim=fixture([0,1,3]);activate(e,sim);
    expect(e.update([],1300+LOSS_GRACE_MS-1,s)[0].state).toBe('ACTIVE');
    expect(e.update([],1300+LOSS_GRACE_MS+1,s)[0].state).toBe('CLOSING');
    expect(e.update([],1300+LOSS_GRACE_MS+FADE_MS+2,s)).toEqual([]);
  });
  it('removes an armed gesture after hand loss without producing a portal',()=>{
    const e=new GestureEngine(),sim=fixture([0,1,2]);e.update([sim.hand(0)],0,s);e.update([sim.hand(1000)],1000,s);
    expect(e.update([],1300,s)).toEqual([]);
  });
  it('clears all active effects and cannot retrigger while still open',()=>{
    const e=new GestureEngine(),sim=fixture([0,1,3]);activate(e,sim);e.clear();expect(e.update([sim.hand(1400)],1400,s)).toEqual([]);
  });
  it('uses palm-normalized distance regardless of hand size',()=>{
    const sim=fixture([0,1,3]);sim.setOpening(.4);const hand=sim.hand(0);
    const small:Hand={...hand,landmarks:hand.landmarks.map(p=>({x:.5+(p.x-.5)*.5,y:.5+(p.y-.5)*.5,z:(p.z??0)*.5}))};
    expect(spread(small,[0,1,3])).toBeCloseTo(spread(hand,[0,1,3]),5);
  });
});
describe('geometry',()=>{
  it('mirrors coordinates reversibly and retains identity',()=>{const p={x:.12,y:.7,z:.1,id:4};expect(mirrorPoint(p,true)).toEqual({...p,x:.88});expect(mirrorPoint(mirrorPoint(p,true),true).x).toBeCloseTo(p.x);expect(mirrorPoint(p,false)).toEqual(p);});
  it('masks only a triangle interior',()=>{const ps=[{x:.5,y:.1},{x:.9,y:.8},{x:.1,y:.8}];expect(pointInPolygon({x:.5,y:.5},ps)).toBe(true);expect(pointInPolygon({x:.1,y:.1},ps)).toBe(false);expect(pointInPolygon({x:.95,y:.7},ps)).toBe(false);});
  function permutations<T>(a:T[]):T[][]{return a.length===1?[a]:a.flatMap((v,i)=>permutations(a.filter((_,j)=>i!==j)).map(rest=>[v,...rest]));}
  it('orders every quadrilateral input permutation into the same stable polygon',()=>{
    const ps=[{x:.2,y:.2,id:0},{x:.8,y:.2,id:1},{x:.8,y:.8,id:2},{x:.2,y:.8,id:3}];
    for(const p of permutations(ps)){const result=orderPolygon(p);expect(result.map(v=>v.id)).toEqual([0,1,2,3]);expect(signedArea(result)).toBeCloseTo(.36);}
  });
  it('keeps winding and stable first finger through a full rotation',()=>{
    for(let a=0;a<Math.PI*2;a+=.15){const ps=[0,1,2,3].map(i=>({x:.5+Math.cos(a+i*Math.PI/2)*.3,y:.5+Math.sin(a+i*Math.PI/2)*.3,id:i}));const result=orderPolygon(ps);expect(result[0].id).toBe(0);expect(signedArea(result)).toBeGreaterThan(0);}
  });
  it('handles concave and degenerate four-point shapes without NaNs',()=>{
    const concave=[{x:0,y:0,id:0},{x:1,y:0,id:1},{x:.4,y:.2,id:2},{x:0,y:1,id:3}];expect(signedArea(orderPolygon(concave))).toBeGreaterThan(0);
    const same=Array.from({length:4},(_,id)=>({x:.5,y:.5,id}));expect(signedArea(orderPolygon(same))).toBe(0);
  });
});
describe('settings persistence',()=>{
  it('roundtrips a custom mapping and numeric settings through storage',()=>{
    const data=new Map<string,string>();const storage={getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);}};
    const custom={...s,intensity:.68,mappings:{...s.mappings,'1-2-3':13}};
    expect(saveSettings(custom,storage)).toBe(true);expect(loadSettings(storage)).toEqual(custom);expect(mappedEffect([1,2,3],loadSettings(storage).mappings)).toBe(13);
  });
  it('falls back safely for corrupt JSON or denied storage',()=>{
    expect(loadSettings({getItem:()=>'{broken'})).toEqual(s);
    expect(saveSettings(s,{setItem:()=>{throw new Error('Denied');}})).toBe(false);
  });
  it('clamps invalid settings and discards removed pair/beam assignments',()=>{
    const result=sanitizeSettings({intensity:500,smoothing:-3,speed:NaN,quality:'ultra',mappings:{'0-1':24,'0-1-2':0,'1-2-3':13}});
    expect(result.intensity).toBe(1);expect(result.smoothing).toBe(0);expect(result.speed).toBe(s.speed);expect(result.quality).toBe('auto');
    expect(result.mappings['0-1']).toBeUndefined();expect(result.mappings['0-1-2']).toBe(10);expect(result.mappings['1-2-3']).toBe(13);expect(STORAGE_KEY).toContain('v2');
  });
});
describe('hand identity',()=>{
  const detection=(x:number,label:string)=>({landmarks:Array.from({length:21},()=>({x,y:.5,z:0})),handedness:label,confidence:.98});
  it('retains IDs when the detection array order changes',()=>{
    const tracker=new HandIdentityTracker();const a=tracker.update([detection(.2,'Left'),detection(.8,'Right')],0,.4,16/9);
    const b=tracker.update([detection(.78,'Right'),detection(.22,'Left')],33,.4,16/9);
    expect(b[0].id).toBe(a[1].id);expect(b[1].id).toBe(a[0].id);
  });
  it('uses handedness and motion continuity as hands approach and cross',()=>{
    const tracker=new HandIdentityTracker();const a=tracker.update([detection(.4,'Left'),detection(.6,'Right')],0,0,16/9);
    tracker.update([detection(.48,'Left'),detection(.52,'Right')],33,0,16/9);
    const b=tracker.update([detection(.44,'Right'),detection(.56,'Left')],66,0,16/9);expect(b[0].id).toBe(a[1].id);expect(b[1].id).toBe(a[0].id);
  });
  it('expires old identities after prolonged hand loss',()=>{const tracker=new HandIdentityTracker();const a=tracker.update([detection(.4,'Left')],0,0,16/9);const b=tracker.update([detection(.4,'Left')],1000,0,16/9);expect(b[0].id).not.toBe(a[0].id);});
});
