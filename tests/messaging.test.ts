import { describe, it, expect, vi } from 'vitest';
import { createMessageHost } from '../src/lib/messaging';

function makeSource() {
  return { postMessage: vi.fn() };
}

describe('message host', () => {
  it('handles whitelisted type, calls handler, posts back result', async () => {
    const handler = vi.fn(async (args: any) => ({ data: 42, gotArgs: args }));
    const host = createMessageHost({ ping: handler });
    const source = makeSource();
    await host.handle({
      data: { type: 'ping', id: 'r1', args: { x: 1 } },
      source,
    } as any);
    expect(handler).toHaveBeenCalledWith({ x: 1 });
    expect(source.postMessage).toHaveBeenCalledWith(
      { type: 'response', id: 'r1', ok: true, result: { data: 42, gotArgs: { x: 1 } } },
      '*'
    );
  });

  it('rejects unknown types with ok:false', async () => {
    const host = createMessageHost({});
    const source = makeSource();
    await host.handle({ data: { type: 'evil', id: 'r1', args: {} }, source } as any);
    expect(source.postMessage).toHaveBeenCalledWith(
      { type: 'response', id: 'r1', ok: false, error: expect.stringContaining('evil') },
      '*'
    );
  });

  it('catches handler errors and reports ok:false with message', async () => {
    const host = createMessageHost({ boom: async () => { throw new Error('nope'); } });
    const source = makeSource();
    await host.handle({ data: { type: 'boom', id: 'r1', args: {} }, source } as any);
    expect(source.postMessage).toHaveBeenCalledWith(
      { type: 'response', id: 'r1', ok: false, error: 'nope' },
      '*'
    );
  });

  it('ignores messages with no source (window.parent === null edge)', async () => {
    const handler = vi.fn();
    const host = createMessageHost({ ping: handler });
    await host.handle({ data: { type: 'ping', id: 'r1', args: {} }, source: null } as any);
    expect(handler).not.toHaveBeenCalled();
  });

  it('handles missing args (defaults to {})', async () => {
    const handler = vi.fn(async (args: any) => ({ got: args }));
    const host = createMessageHost({ ping: handler });
    const source = makeSource();
    await host.handle({ data: { type: 'ping', id: 'r1' }, source } as any);
    expect(handler).toHaveBeenCalledWith({});
    expect(source.postMessage).toHaveBeenCalledWith(
      { type: 'response', id: 'r1', ok: true, result: { got: {} } },
      '*'
    );
  });

  it('handles malformed data (no type) gracefully', async () => {
    const host = createMessageHost({ ping: vi.fn() });
    const source = makeSource();
    await host.handle({ data: {}, source } as any);
    // Should not throw; should post a response indicating unknown type (undefined)
    expect(source.postMessage).toHaveBeenCalled();
    const sent = source.postMessage.mock.calls[0][0];
    expect(sent.ok).toBe(false);
  });

  it('attach registers a message listener on the given window', () => {
    const win = { addEventListener: vi.fn() };
    const host = createMessageHost({ ping: vi.fn() });
    host.attach(win as any);
    expect(win.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
  });
});
