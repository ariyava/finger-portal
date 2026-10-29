/** One cancellable capture, based on a monotonic deadline rather than tick counts. */
export class PhotoTimer {
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private token = 0;
  active = false;
  cancel() {
    this.token++; this.active = false;
    if (this.timeout !== undefined) clearTimeout(this.timeout);
    this.timeout = undefined;
  }
  start(seconds: number, onTick: (remaining: number) => void, capture: () => void) {
    this.cancel();
    const token = this.token, deadline = performance.now() + Math.max(0, seconds) * 1000;
    this.active = true;
    let previous = -1;
    const tick = () => {
      if (token !== this.token) return;
      const remaining = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
      if (remaining !== previous) { previous = remaining; onTick(remaining); }
      if (remaining === 0) { this.active = false; this.timeout = undefined; capture(); return; }
      this.timeout = setTimeout(tick, 50);
    };
    tick();
  }
}
