import { describe, expect, it } from 'vitest';
import { isValidPin, validatePlayerPins } from '../pin';

describe('isValidPin', () => {
  it('accepts exactly two digits', () => {
    for (const pin of ['00', '01', '27', '84', '99']) {
      expect(isValidPin(pin)).toBe(true);
    }
  });

  it('rejects anything that is not exactly two digits', () => {
    for (const pin of ['1', '123', 'ab', 'a1', '', ' 1', '1 ', '-1']) {
      expect(isValidPin(pin)).toBe(false);
    }
  });
});

describe('validatePlayerPins', () => {
  it('accepts distinct valid PINs', () => {
    const result = validatePlayerPins(['27', '84', '51']);
    expect(result.valid).toBe(true);
    expect(result.fieldErrors).toEqual(['', '', '']);
  });

  it('flags an invalid PIN by position', () => {
    const result = validatePlayerPins(['27', '8', '51']);
    expect(result.valid).toBe(false);
    expect(result.fieldErrors[1]).not.toBe('');
    expect(result.fieldErrors[0]).toBe('');
    expect(result.fieldErrors[2]).toBe('');
  });

  it('flags duplicate PINs on both offending players', () => {
    const result = validatePlayerPins(['27', '84', '27']);
    expect(result.valid).toBe(false);
    expect(result.fieldErrors[0]).not.toBe('');
    expect(result.fieldErrors[2]).not.toBe('');
    expect(result.fieldErrors[1]).toBe('');
  });

  it('handles four players', () => {
    expect(validatePlayerPins(['00', '01', '02', '03']).valid).toBe(true);
    expect(validatePlayerPins(['00', '01', '02', '00']).valid).toBe(false);
  });
});
