import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDb, type DbBackend } from '../src/lib/db';
import { recordUsage, getUsageSummary, clearUsage } from '../src/lib/usage';

// 인메모리 usage_log 백엔드. db.ts 의 실제 DDL(INSERT/DELETE/SELECT ... WHERE at >= ?)만
// 지원하면 되므로 SQL 을 최소한으로 흉내낸다.
function makeBackend() {
  let rows: any[] = [];
  const backend: DbBackend = {
    async execute(sql: string, params: any[] = []) {
      if (sql.startsWith('CREATE TABLE')) return;
      if (sql.startsWith('INSERT INTO usage_log')) {
        const [at, model, input_tokens, output_tokens, cached_tokens, reasoning_tokens, api_calls] = params;
        rows.push({ id: rows.length + 1, at, model, input_tokens, output_tokens, cached_tokens, reasoning_tokens, api_calls });
        return;
      }
      if (sql.startsWith('DELETE FROM usage_log')) {
        rows = [];
        return;
      }
      throw new Error(`unsupported execute: ${sql}`);
    },
    async query(sql: string, params: any[] = []) {
      if (sql === 'SELECT * FROM usage_log') return { rows: [...rows] };
      if (sql === 'SELECT * FROM usage_log WHERE at >= ?') {
        return { rows: rows.filter(r => r.at >= params[0]) };
      }
      throw new Error(`unsupported query: ${sql}`);
    },
  };
  return backend;
}

describe('usage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('records usage and reflects it in allTime summary', async () => {
    vi.setSystemTime(new Date('2026-08-06T12:00:00'));
    const db = createDb(makeBackend());
    await recordUsage(db, {
      model: 'gpt-5.6-terra',
      usage: { inputTokens: 100, outputTokens: 20, cachedTokens: 5, reasoningTokens: 2 },
      apiCalls: 1,
    });
    const summary = await getUsageSummary(db);
    expect(summary.allTime).toEqual({ inputTokens: 100, outputTokens: 20, cachedTokens: 5, reasoningTokens: 2, apiCalls: 1 });
    expect(summary.today).toEqual(summary.allTime);
  });

  it('sums multiple records', async () => {
    vi.setSystemTime(new Date('2026-08-06T12:00:00'));
    const db = createDb(makeBackend());
    await recordUsage(db, { model: 'a', usage: { inputTokens: 10, outputTokens: 1, cachedTokens: 0, reasoningTokens: 0 }, apiCalls: 1 });
    await recordUsage(db, { model: 'a', usage: { inputTokens: 20, outputTokens: 2, cachedTokens: 0, reasoningTokens: 0 }, apiCalls: 3 });
    const summary = await getUsageSummary(db);
    expect(summary.allTime).toEqual({ inputTokens: 30, outputTokens: 3, cachedTokens: 0, reasoningTokens: 0, apiCalls: 4 });
  });

  it('excludes yesterday from today (local-midnight boundary)', async () => {
    const db = createDb(makeBackend());

    vi.setSystemTime(new Date('2026-08-05T23:59:00'));
    await recordUsage(db, { model: 'a', usage: { inputTokens: 5, outputTokens: 1, cachedTokens: 0, reasoningTokens: 0 }, apiCalls: 1 });

    vi.setSystemTime(new Date('2026-08-06T00:05:00'));
    await recordUsage(db, { model: 'a', usage: { inputTokens: 7, outputTokens: 2, cachedTokens: 0, reasoningTokens: 0 }, apiCalls: 1 });

    const summary = await getUsageSummary(db);
    // 오늘(8/6) 기록만 today 에 잡혀야 한다.
    expect(summary.today).toEqual({ inputTokens: 7, outputTokens: 2, cachedTokens: 0, reasoningTokens: 0, apiCalls: 1 });
    // 어제 기록도 포함해 allTime 은 둘 다.
    expect(summary.allTime).toEqual({ inputTokens: 12, outputTokens: 3, cachedTokens: 0, reasoningTokens: 0, apiCalls: 2 });
    // 최근 7일에는 둘 다 포함.
    expect(summary.last7d).toEqual(summary.allTime);
  });

  it('excludes records older than 7 days from last7d', async () => {
    const db = createDb(makeBackend());

    vi.setSystemTime(new Date('2026-07-01T00:00:00'));
    await recordUsage(db, { model: 'a', usage: { inputTokens: 999, outputTokens: 1, cachedTokens: 0, reasoningTokens: 0 }, apiCalls: 1 });

    vi.setSystemTime(new Date('2026-08-06T00:00:00'));
    await recordUsage(db, { model: 'a', usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0, reasoningTokens: 0 }, apiCalls: 1 });

    const summary = await getUsageSummary(db);
    expect(summary.last7d.inputTokens).toBe(1);
    expect(summary.allTime.inputTokens).toBe(1000);
  });

  it('clearUsage empties all buckets', async () => {
    vi.setSystemTime(new Date('2026-08-06T12:00:00'));
    const db = createDb(makeBackend());
    await recordUsage(db, { model: 'a', usage: { inputTokens: 10, outputTokens: 1, cachedTokens: 0, reasoningTokens: 0 }, apiCalls: 1 });
    await clearUsage(db);
    const summary = await getUsageSummary(db);
    expect(summary.allTime.apiCalls).toBe(0);
    expect(summary.today.inputTokens).toBe(0);
  });
});
