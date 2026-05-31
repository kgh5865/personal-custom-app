import { SCHEMA } from './schema';

export interface DbBackend {
  execute(sql: string, params?: any[]): Promise<void>;
  query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[] }>;
}

export function createDb(backend: DbBackend) {
  return {
    async init() {
      for (const stmt of SCHEMA) {
        await backend.execute(stmt);
      }
    },
    execute: backend.execute.bind(backend),
    query: backend.query.bind(backend),
  };
}

// Production singleton (lazy)
let prodDb: ReturnType<typeof createDb> | null = null;
export async function getDb() {
  if (prodDb) return prodDb;
  const { SQLiteConnection, CapacitorSQLite } = await import('@capacitor-community/sqlite');
  const conn = new SQLiteConnection(CapacitorSQLite);
  const db = await conn.createConnection('app', false, 'no-encryption', 1, false);
  await db.open();
  const backend: DbBackend = {
    async execute(sql, params = []) {
      await db.run(sql, params);
    },
    async query(sql, params = []) {
      const res = await db.query(sql, params);
      return { rows: (res.values ?? []) as any[] };
    },
  };
  prodDb = createDb(backend);
  await prodDb.init();
  return prodDb;
}
