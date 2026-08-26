import { describe, it, expect } from 'vitest';
import { applySm2, DEFAULT_SRS } from '../src/srs.js';

describe('applySm2', () => {
  it('starts a brand-new card at a 1-day interval on a correct answer', () => {
    const result = applySm2(null, true, '2026-01-01');
    expect(result.reps).toBe(1);
    expect(result.intervalDays).toBe(1);
    expect(result.dueDate).toBe('2026-01-02');
  });

  it('grows the interval to 6 days on the second correct answer', () => {
    const first = applySm2(DEFAULT_SRS, true, '2026-01-01');
    const second = applySm2(first, true, '2026-01-02');
    expect(second.reps).toBe(2);
    expect(second.intervalDays).toBe(6);
  });

  it('multiplies the interval by the ease factor from the third correct answer onward', () => {
    let state = DEFAULT_SRS;
    state = applySm2(state, true, '2026-01-01');
    state = applySm2(state, true, '2026-01-02');
    const third = applySm2(state, true, '2026-01-08');
    expect(third.reps).toBe(3);
    expect(third.intervalDays).toBe(Math.round(6 * state.easeFactor));
  });

  it('resets reps and shortens the interval to 1 day on an incorrect answer', () => {
    let state = DEFAULT_SRS;
    state = applySm2(state, true, '2026-01-01');
    state = applySm2(state, true, '2026-01-02');
    const missed = applySm2(state, false, '2026-01-08');
    expect(missed.reps).toBe(0);
    expect(missed.intervalDays).toBe(1);
    expect(missed.dueDate).toBe('2026-01-09');
  });

  it('never drops the ease factor below 1.3', () => {
    let state = DEFAULT_SRS;
    for (let i = 0; i < 20; i++) {
      state = applySm2(state, false, '2026-01-01');
    }
    expect(state.easeFactor).toBeGreaterThanOrEqual(1.3);
  });

  it('increases the ease factor on repeated correct answers', () => {
    let state = DEFAULT_SRS;
    for (let i = 0; i < 5; i++) {
      state = applySm2(state, true, '2026-01-01');
    }
    expect(state.easeFactor).toBeGreaterThan(DEFAULT_SRS.easeFactor);
  });
});
