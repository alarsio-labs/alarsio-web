import { requestSyncSoon, setActiveSync, syncNowSoon } from '../request-sync';

const engine = (requestSync = jest.fn(), retryNow = jest.fn().mockResolvedValue(undefined)) => ({ requestSync, retryNow });

describe('requestSyncSoon', () => {
  afterEach(() => setActiveSync(null));

  it('asks the registered engine to sync', () => {
    const requestSync = jest.fn();
    setActiveSync(engine(requestSync));
    requestSyncSoon();
    expect(requestSync).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no engine is running', () => {
    expect(() => requestSyncSoon()).not.toThrow();
  });

  it('stops asking an engine once it is unregistered', () => {
    const requestSync = jest.fn();
    setActiveSync(engine(requestSync));
    setActiveSync(null);
    requestSyncSoon();
    expect(requestSync).not.toHaveBeenCalled();
  });
});

describe('syncNowSoon', () => {
  afterEach(() => setActiveSync(null));

  it('waits for the registered engine to push and pull', async () => {
    let done = false;
    const retryNow = jest.fn(async () => {
      await Promise.resolve();
      done = true;
    });
    setActiveSync(engine(undefined, retryNow));
    await syncNowSoon();
    expect(retryNow).toHaveBeenCalledTimes(1);
    expect(done).toBe(true);
  });

  it('does nothing when no engine is running', async () => {
    await expect(syncNowSoon()).resolves.toBeUndefined();
  });

  it('does not throw when the engine fails', async () => {
    setActiveSync(engine(undefined, jest.fn().mockRejectedValue(new Error('boom'))));
    await expect(syncNowSoon()).resolves.toBeUndefined();
  });
});
