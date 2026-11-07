import test from 'node:test';
import assert from 'node:assert/strict';
import { SleepTimer, sleepDurations } from '../public/sleep-timer.js';

function fixture() {
  let now = 1000, serial = 0, expired = 0;
  const pending = new Map();
  const timer = new SleepTimer({ now: () => now, onExpire: () => expired++, schedule: (fn, ms) => { const id = ++serial; pending.set(id, { fn, ms }); return id; }, unschedule: id => pending.delete(id) });
  return { timer, pending, advance: ms => { now += ms; }, expired: () => expired };
}

test('all four presets expire once at their deadline, including a delayed wake', () => {
  assert.deepEqual(sleepDurations, [10, 15, 25, 55]);
  for (const minutes of sleepDurations) {
    const { timer, pending, advance, expired } = fixture();
    timer.start(minutes); assert.equal(timer.remainingSeconds, minutes * 60);
    advance(minutes * 60_000 - 1); timer.check(); assert.equal(expired(), 0); assert.equal(pending.size, 1);
    advance(60_001); timer.check(); assert.equal(expired(), 1); assert.equal(timer.deadline, null); assert.equal(pending.size, 0);
    timer.check(); assert.equal(expired(), 1);
  }
});

test('replacement and cancellation clear prior callbacks; invalid values leave the timer intact', () => {
  const { timer, pending, advance, expired } = fixture();
  timer.start(10); advance(9 * 60_000); timer.start(55);
  assert.equal(pending.size, 1); assert.equal(timer.remainingSeconds, 55 * 60);
  const deadline = timer.deadline;
  for (const value of [0, -1, 5, '10', NaN, Infinity]) assert.throws(() => timer.start(value), RangeError);
  assert.equal(timer.deadline, deadline);
  advance(60_000); timer.check(); assert.equal(expired(), 0);
  timer.cancel(); advance(60 * 60_000); timer.check(); assert.equal(expired(), 0); assert.equal(pending.size, 0);
});
