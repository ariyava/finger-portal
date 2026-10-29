import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PhotoTimer } from '../src/core/photo-timer';
beforeEach(()=>vi.useFakeTimers());
afterEach(()=>vi.useRealTimers());
it('counts down and captures exactly once at the deadline',()=>{
  const t=new PhotoTimer(),tick=vi.fn(),capture=vi.fn();t.start(3,tick,capture);
  expect(tick).toHaveBeenLastCalledWith(3);vi.advanceTimersByTime(2000);
  expect(tick).toHaveBeenLastCalledWith(1);expect(capture).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1000);expect(capture).toHaveBeenCalledTimes(1);expect(t.active).toBe(false);
  vi.advanceTimersByTime(10000);expect(capture).toHaveBeenCalledTimes(1);
});
it('cancels pending capture',()=>{const t=new PhotoTimer(),capture=vi.fn();t.start(5,()=>{},capture);t.cancel();vi.advanceTimersByTime(6000);expect(capture).not.toHaveBeenCalled();});
it('replaces a pending timer without a duplicate photo',()=>{const t=new PhotoTimer(),a=vi.fn(),b=vi.fn();t.start(3,()=>{},a);vi.advanceTimersByTime(1000);t.start(5,()=>{},b);vi.advanceTimersByTime(5000);expect(a).not.toHaveBeenCalled();expect(b).toHaveBeenCalledTimes(1);});
it('supports immediate capture when delay is off',()=>{const t=new PhotoTimer(),capture=vi.fn();t.start(0,()=>{},capture);expect(capture).toHaveBeenCalledTimes(1);expect(t.active).toBe(false);});
