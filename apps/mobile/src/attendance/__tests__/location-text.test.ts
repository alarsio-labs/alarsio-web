import type { UnavailableCause } from '../location';
import { locationProblemText, opensSettings } from '../location-text';

// Phone review, 12 Nov 2026: each cause says what is wrong and what to do.
describe('locationProblemText', () => {
  const causes: UnavailableCause[] = ['denied', 'services_off', 'timeout', 'error'];

  it('keeps the old opening for every cause, and always offers the reason path', () => {
    for (const cause of causes) {
      const text = locationProblemText(cause, 'in');
      expect(text).toMatch(/^Location is not available/);
      expect(text).toMatch(/say why you are checking in without it\.$/);
    }
    expect(locationProblemText('timeout', 'out')).toMatch(/checking out without it\.$/);
  });

  it('names the cause in plain words', () => {
    expect(locationProblemText('denied', 'in')).toMatch(/not allowed to use it.*Allow it in Settings/);
    expect(locationProblemText('services_off', 'in')).toMatch(/turned off.*quick settings/);
    expect(locationProblemText('timeout', 'in')).toMatch(/could not find where you are.*Step into the open/);
  });

  it('gives four different sentences', () => {
    expect(new Set(causes.map((c) => locationProblemText(c, 'in'))).size).toBe(4);
  });
});

describe('opensSettings', () => {
  it('sends only a refused permission to Settings', () => {
    expect(opensSettings('denied')).toBe(true);
    expect(opensSettings('services_off')).toBe(false);
    expect(opensSettings('timeout')).toBe(false);
    expect(opensSettings('error')).toBe(false);
  });
});
