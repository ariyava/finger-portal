import { it, expect } from 'vitest';
import { sharedEffect, combinations } from '../src/core/effects';
import { sanitizeSettings } from '../src/core/settings';
import { GestureEngine } from '../src/core/gestures';
import { Simulator } from '../src/core/simulator';
const settings=sanitizeSettings({});
it('defaults to automatic selection even for old saved rainbow-only mappings',()=>{
  const old=sanitizeSettings({mappings:{'shared-4':21}});
  expect(old.sharedAuto).toBe(true);
  expect(sharedEffect([{handId:1,finger:0},{handId:1,finger:1},{handId:2,finger:0},{handId:2,finger:1}],old)).toBe(10);
});
it('assigns ten different filters to the ten matching two-hand finger pairs',()=>{
  const ids=combinations(2).map(pair=>sharedEffect(pair.flatMap(finger=>[{handId:1,finger},{handId:2,finger}]),settings));
  expect(new Set(ids).size).toBe(10);
});
it('is invariant to hand IDs, handedness order and member array order',()=>{
  const a=[{handId:2,finger:0 as const},{handId:2,finger:1 as const},{handId:9,finger:3 as const}];
  expect(sharedEffect(a,settings)).toBe(sharedEffect(a.map(m=>({...m,handId:m.handId===2?80:1})).reverse(),settings));
});
it('honors an explicit manual filter rather than forcing automatic or rainbow',()=>{
  const manual=sanitizeSettings({sharedAuto:false,mappings:{'shared-4':17}});
  expect(sharedEffect([{handId:1,finger:0},{handId:1,finger:1},{handId:2,finger:0},{handId:2,finger:1}],manual)).toBe(17);
});
it('opens in automatic mode and applies explicit manual changes without replacing fingers',()=>{
  const engine=new GestureEngine(),sim=new Simulator();sim.selectShared(4,0,260);sim.setOpening(0);
  engine.update(sim.hands(0),0,settings);engine.update(sim.hands(1000),1000,settings);sim.setOpening(1);
  engine.update(sim.hands(1100),1100,settings);const g=engine.update(sim.hands(1300),1300,settings)[0];
  expect(g.effect).toBe(10);const members=[...g.members];engine.setSharedEffect(17,4);
  expect(g.effect).toBe(17);expect(g.members).toEqual(members);expect(g.state).toBe('ACTIVE');
});
