/**
 * Unit tests — Language / Location mapping
 *
 * Tests: STATE_LANGUAGE_MAP coverage and DEFAULT_LANGUAGE_CHAIN fallback.
 */
import { STATE_LANGUAGE_MAP, DEFAULT_LANGUAGE_CHAIN } from '@crashguard/constants';

describe('STATE_LANGUAGE_MAP', () => {
  it('exists and is non-empty', () => {
    expect(Object.keys(STATE_LANGUAGE_MAP).length).toBeGreaterThan(10);
  });

  it('contains correct primary language for Tamil Nadu', () => {
    expect(STATE_LANGUAGE_MAP['Tamil Nadu'][0]).toBe('ta');
  });

  it('contains correct primary language for Karnataka', () => {
    expect(STATE_LANGUAGE_MAP['Karnataka'][0]).toBe('kn');
  });

  it('contains correct primary language for Maharashtra', () => {
    expect(STATE_LANGUAGE_MAP['Maharashtra'][0]).toBe('mr');
  });

  it('always includes English as a fallback somewhere in chain', () => {
    Object.entries(STATE_LANGUAGE_MAP).forEach(([state, chain]) => {
      expect(chain).toContain('en');
    });
  });

  it('Hindi-belt states start with hi', () => {
    const hindiStates = ['Uttar Pradesh', 'Bihar', 'Rajasthan', 'Delhi'];
    hindiStates.forEach(state => {
      expect(STATE_LANGUAGE_MAP[state][0]).toBe('hi');
    });
  });
});

describe('DEFAULT_LANGUAGE_CHAIN', () => {
  it('fallback starts with Hindi', () => {
    expect(DEFAULT_LANGUAGE_CHAIN[0]).toBe('hi');
  });

  it('fallback ends with English', () => {
    expect(DEFAULT_LANGUAGE_CHAIN[DEFAULT_LANGUAGE_CHAIN.length - 1]).toBe('en');
  });
});
