import { describe, expect, it } from 'vitest';
import { errorMessage, toResult } from './result';

describe('errorMessage', () => {
  it('extracts messages from errors, strings and arbitrary values', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage(new TypeError('typed'))).toBe('typed');
    expect(errorMessage('plain')).toBe('plain');
    expect(errorMessage({ code: 1 })).toBe('{"code":1}');
    expect(errorMessage(undefined)).toBe('undefined');
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(typeof errorMessage(circular)).toBe('string');
  });
});

describe('toResult', () => {
  it('wraps return values and void results as success', () => {
    expect(toResult(() => ({ folderPath: 'a' }))).toEqual({ success: true, folderPath: 'a' });
    expect(toResult(() => undefined)).toEqual({ success: true });
  });

  it('turns thrown values into { success: false, error }', () => {
    expect(
      toResult(() => {
        throw new Error('nope');
      })
    ).toEqual({ success: false, error: 'nope' });
    expect(
      toResult(() => {
        throw 'str';
      })
    ).toEqual({ success: false, error: 'str' });
  });
});
