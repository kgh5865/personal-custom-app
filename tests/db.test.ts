import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, type DbBackend } from '../src/lib/db';

// In-memory backend for tests
function memoryBackend(): DbBackend {
  const rows: any[] = [];
  return {
    async execute(sql: string) {
      // very small stub: only used to verify it gets called
      (rows as any).push({ sql });
    },
    async query(sql: string) {
      return { rows };
    },
  };
}

describe('db', () => {
  let backend: DbBackend;
  beforeEach(() => {
    backend = memoryBackend();
  });

  it('runs schema on init', async () => {
    const db = createDb(backend);
    await db.init();
    const log = await backend.query('');
    expect(log.rows.length).toBeGreaterThan(0);
    expect(log.rows[0].sql).toContain('user_profile');
  });

  it('exposes execute and query', async () => {
    const db = createDb(backend);
    expect(typeof db.execute).toBe('function');
    expect(typeof db.query).toBe('function');
  });
});
