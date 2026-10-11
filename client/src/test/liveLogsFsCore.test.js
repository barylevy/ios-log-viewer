/**
 * Folder-mode live logs decide between "append the new bytes" and "start over"
 * from file sizes alone. A wrong call either drops lines or duplicates them,
 * so each rotation shape is pinned here.
 */

import { describe, it, expect } from 'vitest';
import { planRead, tailLines, naturalCompare } from '../utils/liveLogsFsCore';

const f = (name, size) => ({ name, size });

describe('planRead', () => {
  it('resets on first read', () => {
    expect(planRead(null, [f('a.log', 10)])).toEqual({ kind: 'reset' });
  });

  it('does nothing when sizes are unchanged', () => {
    expect(planRead([f('a.log', 10)], [f('a.log', 10)])).toEqual({ kind: 'none' });
    expect(planRead([], [])).toEqual({ kind: 'none' });
  });

  it('appends from the old size when the last file grows', () => {
    expect(planRead([f('a.log', 10)], [f('a.log', 25)]))
      .toEqual({ kind: 'append', name: 'a.log', offset: 10 });
  });

  it('appends when only the last of several files grows', () => {
    const prev = [f('a.1.log', 100), f('a.2.log', 10)];
    const curr = [f('a.1.log', 100), f('a.2.log', 15)];
    expect(planRead(prev, curr)).toEqual({ kind: 'append', name: 'a.2.log', offset: 10 });
  });

  it('resets when the last file shrinks (truncated in place)', () => {
    expect(planRead([f('a.log', 50)], [f('a.log', 5)])).toEqual({ kind: 'reset' });
  });

  it('resets when an earlier file changes', () => {
    const prev = [f('a.1.log', 100), f('a.2.log', 10)];
    const curr = [f('a.1.log', 120), f('a.2.log', 10)];
    expect(planRead(prev, curr)).toEqual({ kind: 'reset' });
  });

  it('resets when a file is added, removed or renamed (rotation)', () => {
    expect(planRead([f('a.log', 10)], [f('a.log', 10), f('a.1.log', 3)])).toEqual({ kind: 'reset' });
    expect(planRead([f('a.1.log', 10), f('a.2.log', 3)], [f('a.2.log', 3)])).toEqual({ kind: 'reset' });
    expect(planRead([f('a.log', 10)], [f('b.log', 10)])).toEqual({ kind: 'reset' });
  });
});

describe('tailLines', () => {
  it('returns everything when there are fewer lines than asked', () => {
    expect(tailLines('a\nb', 5)).toBe('a\nb');
    expect(tailLines('', 5)).toBe('');
  });

  it('returns the last n lines', () => {
    expect(tailLines('a\nb\nc\nd', 2)).toBe('c\nd');
  });
});

describe('naturalCompare', () => {
  it('orders numbered rotations numerically', () => {
    expect(['log.10', 'log.2', 'log.1'].sort(naturalCompare)).toEqual(['log.1', 'log.2', 'log.10']);
  });
});
