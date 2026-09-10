import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpSimulatorTransport, openHttpTransport } from '../lib/simulator/transport';
import { buildInitialState } from '../lib/simulator/engine';

/**
 * Models `window.fetch`.
 *
 * A browser's fetch is a method of the global object and throws "Illegal
 * invocation" when called with any other receiver. Node's global fetch does not
 * check, which is why storing it unbound on a class property passed every test
 * and every Node run, and still broke the console the moment a browser loaded it.
 *
 * Installing it UNBOUND on globalThis is the whole point: a test that installs
 * an already-bound stub cannot fail, whatever the code under test does.
 */
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let calls = 0;
const original = globalThis.fetch;

const installBrowserFetch = (respond: () => Response) => {
  calls = 0;
  function browserFetch(this: unknown) {
    if (this !== globalThis) {
      throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
    }
    calls += 1;
    return Promise.resolve(respond());
  }
  (globalThis as { fetch: unknown }).fetch = browserFetch;
};

afterEach(() => {
  (globalThis as { fetch: unknown }).fetch = original;
});

describe('HttpSimulatorTransport', () => {
  it('calls fetch with a receiver a browser accepts', async () => {
    installBrowserFetch(() => json({ accepted: true, revision: 7 }));

    const transport = new HttpSimulatorTransport({
      baseUrl: 'https://example.test',
      token: 'sim_test',
      vehicleId: 'v1',
    });

    const ack = await transport.sendTelemetry(new Date().toISOString(), buildInitialState());
    expect(ack.accepted).toBe(true);
    expect(ack.revision).toBe(7);
    expect(calls).toBe(1);
  });

  it('claims commands without losing the binding', async () => {
    installBrowserFetch(() => json({ command: null }));

    const transport = new HttpSimulatorTransport({
      baseUrl: 'https://example.test',
      token: 'sim_test',
      vehicleId: 'v1',
    });

    expect(await transport.claimCommand()).toBeNull();
    expect(calls).toBe(1);
  });

  it('opens a session without losing the binding', async () => {
    installBrowserFetch(() => json({ session: { id: 's1', token: 'sim_x', expiresAt: 'later' } }, 201));

    const opened = await openHttpTransport({
      baseUrl: 'https://example.test',
      accessToken: 'user-token',
      vehicleId: 'v1',
    });

    expect(opened.sessionId).toBe('s1');
    expect(calls).toBe(1);
  });

  it('still honours an injected fetch', async () => {
    const spy = vi.fn().mockResolvedValue(json({ command: null }));
    const transport = new HttpSimulatorTransport({
      baseUrl: 'https://example.test',
      token: 'sim_test',
      vehicleId: 'v1',
      fetchImpl: spy as unknown as typeof fetch,
    });

    expect(await transport.claimCommand()).toBeNull();
    expect(spy).toHaveBeenCalledOnce();
  });
});
