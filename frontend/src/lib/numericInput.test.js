import { describe, expect, it } from 'vitest';
import {
  displayNumericValue,
  normalizeNumericOnBlur,
  parseNumericInput,
  sanitizeNumericText
} from './numericInput.js';

describe('numericInput helpers', () => {
  it('displayNumericValue shows empty for blank', () => {
    expect(displayNumericValue('')).toBe('');
    expect(displayNumericValue(null)).toBe('');
    expect(displayNumericValue(15)).toBe(15);
  });

  it('parseNumericInput allows empty while typing', () => {
    expect(parseNumericInput('')).toBe('');
    expect(parseNumericInput('15')).toBe(15);
    expect(parseNumericInput('0')).toBe(0);
  });

  it('sanitizeNumericText strips leading zeros for integers', () => {
    expect(sanitizeNumericText('015', { integer: true })).toBe('15');
    expect(sanitizeNumericText('0', { integer: true })).toBe('0');
    expect(sanitizeNumericText('0125', { integer: true })).toBe('125');
  });

  it('parseNumericInput respects min', () => {
    expect(parseNumericInput('0', { min: 1 })).toBe('');
    expect(parseNumericInput('5', { min: 1, max: 31, integer: true })).toBe(5);
  });

  it('normalizeNumericOnBlur applies fallback', () => {
    expect(normalizeNumericOnBlur('', 0)).toBe(0);
    expect(normalizeNumericOnBlur(12, 0)).toBe(12);
  });
});
