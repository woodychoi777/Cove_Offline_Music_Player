export const sleepDurations = Object.freeze([10, 15, 25, 55]);

// A wall-clock deadline survives delayed callbacks and waking from sleep.
export class SleepTimer {
  constructor({ onExpire, onChange = () => {}, now = Date.now, schedule = (fn, delay) => setTimeout(fn, delay), unschedule = handle => clearTimeout(handle) }) {
    Object.assign(this, { onExpire, onChange, now, schedule, unschedule });
    this.deadline = null;
    this.minutes = null;
    this.handle = null;
  }
  get remainingSeconds() { return this.deadline === null ? 0 : Math.max(0, Math.ceil((this.deadline - this.now()) / 1000)); }
  start(minutes) {
    if (!sleepDurations.includes(minutes)) throw new RangeError('Unsupported sleep timer duration');
    this.cancel(false);
    this.minutes = minutes;
    this.deadline = this.now() + minutes * 60_000;
    this.check();
  }
  cancel(notify = true) {
    if (this.handle !== null) this.unschedule(this.handle);
    this.handle = this.deadline = this.minutes = null;
    if (notify) this.onChange();
  }
  check() {
    if (this.deadline === null) return;
    if (this.handle !== null) this.unschedule(this.handle);
    this.handle = null;
    const remaining = this.deadline - this.now();
    if (remaining <= 0) {
      this.cancel(false);
      this.onExpire();
      this.onChange();
      return;
    }
    this.onChange();
    this.handle = this.schedule(() => this.check(), Math.min(remaining, 1000));
  }
}
