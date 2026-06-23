import { describe, expect, it } from 'vitest';
import { md5Hex } from '../src/lib/md5.ts';

describe('md5Hex', () => {
  it('matches RFC 1321 vector for "abc"', () => {
    expect(md5Hex('abc')).toBe('900150983cd24fb0d6963f7d28e17f72');
  });
});