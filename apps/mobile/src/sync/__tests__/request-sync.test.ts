import { requestSyncSoon, setActiveSync } from '../request-sync';

describe('requestSyncSoon', () => {
  afterEach(() => setActiveSync(null));

  it('asks the registered engine to sync', () => {
    const requestSync = jest.fn();
    setActiveSync({ requestSync });
    requestSyncSoon();
    expect(requestSync).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no engine is running', () => {
    expect(() => requestSyncSoon()).not.toThrow();
  });

  it('stops asking an engine once it is unregistered', () => {
    const requestSync = jest.fn();
    setActiveSync({ requestSync });
    setActiveSync(null);
    requestSyncSoon();
    expect(requestSync).not.toHaveBeenCalled();
  });
});
