import { SCHEMA } from './schema';

export interface DbBackend {
  execute(sql: string, params?: any[]): Promise<void>;
  query(sql: string, params?: any[]): Promise<{ rows: any[] }>;
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

export type Db = ReturnType<typeof createDb>;

// Production singleton (lazy). Cache the in-flight promise so concurrent
// callers share one initialization; clear it on failure so a later call can retry.
let initPromise: Promise<Db> | null = null;
export function getDb(): Promise<Db> {
  if (!initPromise) initPromise = initProd();
  return initPromise;
}

async function initProd(): Promise<Db> {
  try {
    const { SQLiteConnection, CapacitorSQLite } = await import('@capacitor-community/sqlite');
    const conn = new SQLiteConnection(CapacitorSQLite);
    const db = await conn.createConnection('app', false, 'no-encryption', 1, false);
    await db.open();
    const backend: DbBackend = {
      // Route DDL (no params) through native execute(); DML (with params)
      // through native run() which handles parameter binding and transactions.
      async execute(sql, params = []) {
        if (params.length === 0) {
          await db.execute(sql);
        } else {
          await db.run(sql, params);
        }
      },
      async query(sql, params = []) {
        const res = await db.query(sql, params);
        return { rows: (res.values ?? []) as any[] };
      },
    };
    const instance = createDb(backend);
    await instance.init();
    return instance;
  } catch (e) {
    initPromise = null;
    throw e;
  }
}
