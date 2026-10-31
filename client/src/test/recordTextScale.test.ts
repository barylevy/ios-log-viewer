import { describe, it, expect } from 'vitest';
import { nextScale, MIN_SCALE, MAX_SCALE } from '../utils/useRecordTextScale';

describe('nextScale', () => {
  it('steps up and down by 0.1 without float drift', () => {
    expect(nextScale('=', 1)).toBe(1.1);
    expect(nextScale('+', 1.1)).toBe(1.2);
    expect(nextScale('-', 1)).toBe(0.9);
    expect(nextScale('-', 0.8)).toBe(0.7);
  });

  it('resets on 0', () => {
    expect(nextScale('0', 2.4)).toBe(1);
  });

  it('clamps to the allowed range', () => {
    expect(nextScale('-', MIN_SCALE)).toBe(MIN_SCALE);
    expect(nextScale('=', MAX_SCALE)).toBe(MAX_SCALE);
  });

  it('ignores other keys', () => {
    expect(nextScale('a', 1)).toBeNull();
  });
});

describe('nextScale with a non-Latin keyboard layout', () => {
  it('falls back to the physical key code', () => {
    expect(nextScale('=', 1, 'Equal')).toBe(1.1);
    expect(nextScale('ס', 1, 'Minus')).toBe(0.9);
    expect(nextScale('ש', 2, 'Digit0')).toBe(1);
  });
});
