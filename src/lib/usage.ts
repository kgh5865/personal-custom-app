import type { Db } from './db';
import type { TokenUsage } from './openai';

export interface UsageBucket {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  apiCalls: number;
}

export interface UsageSummary {
  today: UsageBucket;
  last7d: UsageBucket;
  allTime: UsageBucket;
}

function emptyBucket(): UsageBucket {
  return { inputTokens: 0, outputTokens: 0, cachedTokens: 0, reasoningTokens: 0, apiCalls: 0 };
}

function sumRows(rows: any[]): UsageBucket {
  const b = emptyBucket();
  for (const r of rows) {
    b.inputTokens += r.input_tokens ?? 0;
    b.outputTokens += r.output_tokens ?? 0;
    b.cachedTokens += r.cached_tokens ?? 0;
    b.reasoningTokens += r.reasoning_tokens ?? 0;
    b.apiCalls += r.api_calls ?? 0;
  }
  return b;
}

export async function recordUsage(
  db: Db,
  args: { model: string; usage: TokenUsage; apiCalls: number }
): Promise<void> {
  await db.execute(
    `INSERT INTO usage_log (at, model, input_tokens, output_tokens, cached_tokens, reasoning_tokens, api_calls)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      Date.now(),
      args.model,
      args.usage.inputTokens,
      args.usage.outputTokens,
      args.usage.cachedTokens,
      args.usage.reasoningTokens,
      args.apiCalls,
    ]
  );
}

export async function getUsageSummary(db: Db): Promise<UsageSummary> {
  const now = new Date();
  // "오늘" 은 로컬 자정 기준 (UTC 아님)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const last7dStart = now.getTime() - 7 * 24 * 60 * 60 * 1000;

  const [todayRows, last7dRows, allRows] = await Promise.all([
    db.query('SELECT * FROM usage_log WHERE at >= ?', [todayStart]),
    db.query('SELECT * FROM usage_log WHERE at >= ?', [last7dStart]),
    db.query('SELECT * FROM usage_log'),
  ]);

  return {
    today: sumRows(todayRows.rows),
    last7d: sumRows(last7dRows.rows),
    allTime: sumRows(allRows.rows),
  };
}

export async function clearUsage(db: Db): Promise<void> {
  await db.execute('DELETE FROM usage_log');
}
