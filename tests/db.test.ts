import { describe, it, expect, vi } from 'vitest';
import { createDb, type DbBackend } from '../src/lib/db';
import { SCHEMA } from '../src/lib/schema';

function makeBackend(): DbBackend & {
  execSpy: ReturnType<typeof vi.fn>;
  querySpy: ReturnType<typeof vi.fn>;
} {
  const execSpy = vi.fn(async () => {});
  const querySpy = vi.fn(async () => ({ rows: [] }));
  return { execute: execSpy, query: querySpy, execSpy, querySpy };
}

describe('db', () => {
  it('init runs every schema statement in order', async () => {
    const backend = makeBackend();
    const db = createDb(backend);
    await db.init();
    expect(backend.execSpy).toHaveBeenCalledTimes(SCHEMA.length);
    for (let i = 0; i < SCHEMA.length; i++) {
      expect(backend.execSpy.mock.calls[i][0]).toBe(SCHEMA[i]);
    }
  });

  it('init is idempotent (can be called twice without error)', async () => {
    const backend = makeBackend();
    const db = createDb(backend);
    await db.init();
    await db.init();
    expect(backend.execSpy).toHaveBeenCalledTimes(SCHEMA.length * 2);
  });

  it('execute/query delegate to backend', async () => {
    const backend = makeBackend();
    const db = createDb(backend);
    await db.execute('SELECT 1', [1]);
    await db.query('SELECT 2', [2]);
    expect(backend.execSpy).toHaveBeenCalledWith('SELECT 1', [1]);
    expect(backend.querySpy).toHaveBeenCalledWith('SELECT 2', [2]);
  });
});
