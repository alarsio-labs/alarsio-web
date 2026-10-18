import { signInErrorMessage } from '../auth-client';
import { signOutWarning } from '../sign-out-warning';

describe('signInErrorMessage', () => {
  it('names wrong credentials and an unconfirmed email', () => {
    expect(signInErrorMessage({ code: 'invalid_credentials' })).toBe('Email or password is wrong.');
    expect(signInErrorMessage({ code: 'email_not_confirmed' })).toMatch(/Confirm your email/);
  });

  it('explains no connection and rate limits', () => {
    expect(signInErrorMessage({ name: 'AuthRetryableFetchError' })).toMatch(/No connection/);
    expect(signInErrorMessage({ status: 429 })).toMatch(/Too many attempts/);
  });

  it('never shows server text for anything else', () => {
    expect(signInErrorMessage({ code: 'something_new' })).toBe('Could not sign in. Try again.');
    expect(signInErrorMessage(null)).toBe('Could not sign in. Try again.');
  });
});

describe('signOutWarning', () => {
  it('says nothing when everything is sent', () => {
    expect(signOutWarning(0)).toBeNull();
  });

  it('counts unsent records and says they are kept', () => {
    expect(signOutWarning(1)).toMatch(/^1 record you saved has not reached/);
    expect(signOutWarning(3)).toMatch(/^3 records you saved have not reached/);
    expect(signOutWarning(3)).toMatch(/stay on this phone/);
  });
});
