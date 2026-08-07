import { describe, it, expect, vi } from 'vitest';
import { createDb, type DbBackend } from '../src/lib/db';
import {
  estimateTokens, estimateHistoryTokens, needsCompaction,
  createCompactor, KEEP_RECENT_MESSAGES, COMPACT_THRESHOLD_TOKENS, CHARS_PER_TOKEN,
} from '../src/lib/compact';
import type { ChatMessage } from '../src/lib/gpt/bridge';

function makeBackend() {
  const rows: any[] = [];
  let id = 0;
  const backend: DbBackend = {
    async execute(sql: string, params: any[] = []) {
      if (sql.startsWith('CREATE TABLE')) return;
      if (sql.startsWith('INSERT INTO chat_summary')) {
        id++;
        const [upto_message_id, content, created_at] = params;
        rows.push({ id, upto_message_id, content, created_at });
        return;
      }
      throw new Error(`unsupported execute: ${sql}`);
    },
    async query(sql: string) {
      if (sql.startsWith('SELECT upto_message_id, content FROM chat_summary')) {
        const sorted = [...rows].sort((a, b) => b.id - a.id);
        return { rows: sorted.length ? [sorted[0]] : [] };
      }
      throw new Error(`unsupported query: ${sql}`);
    },
  };
  return backend;
}

function msgs(n: number, opts: { withIds?: boolean; content?: (i: number) => string } = {}): ChatMessage[] {
  const { withIds = true, content = (i) => `message ${i}` } = opts;
  return Array.from({ length: n }, (_, i) => ({
    role: (i % 2 === 0 ? 'user' : 'assistant') as ChatMessage['role'],
    content: content(i + 1),
    ...(withIds ? { id: i + 1 } : {}),
  }));
}

describe('compact: estimateTokens / estimateHistoryTokens', () => {
  it('estimates roughly length / CHARS_PER_TOKEN, rounded up', () => {
    expect(estimateTokens('a'.repeat(10))).toBe(Math.ceil(10 / CHARS_PER_TOKEN));
    expect(estimateTokens('')).toBe(0);
  });

  it('sums tokens across all messages', () => {
    const list: ChatMessage[] = [{ role: 'user', content: 'a'.repeat(10) }, { role: 'assistant', content: 'b'.repeat(5) }];
    expect(estimateHistoryTokens(list)).toBe(estimateTokens('a'.repeat(10)) + estimateTokens('b'.repeat(5)));
  });
});

describe('compact: needsCompaction', () => {
  it('false when there are not enough messages to fold, even if huge', () => {
    const list = msgs(KEEP_RECENT_MESSAGES, { content: () => 'x'.repeat(100000) });
    expect(needsCompaction(list)).toBe(false);
  });

  it('false when over KEEP_RECENT_MESSAGES but under the token threshold', () => {
    const list = msgs(KEEP_RECENT_MESSAGES + 5, { content: () => 'short' });
    expect(estimateHistoryTokens(list)).toBeLessThan(COMPACT_THRESHOLD_TOKENS);
    expect(needsCompaction(list)).toBe(false);
  });

  it('true when over KEEP_RECENT_MESSAGES and over the token threshold', () => {
    const bigMsg = 'x'.repeat(Math.ceil(COMPACT_THRESHOLD_TOKENS * CHARS_PER_TOKEN));
    const list = msgs(KEEP_RECENT_MESSAGES + 1, { content: (i) => (i === 1 ? bigMsg : 'y') });
    expect(needsCompaction(list)).toBe(true);
  });
});

describe('compact: createCompactor().compact()', () => {
  it('folds everything but the most recent KEEP_RECENT_MESSAGES', async () => {
    const db = createDb(makeBackend());
    const summarize = vi.fn(async (input: ChatMessage[]) => `summary of ${input.length} messages`);
    const compactor = createCompactor({ db, summarize });
    const list = msgs(KEEP_RECENT_MESSAGES + 4);

    const result = await compactor.compact(list);

    expect(result).not.toBeNull();
    // 4 개가 접혀야 한다 (14 - 10)
    expect(summarize).toHaveBeenCalledOnce();
    const summarizedInput = summarize.mock.calls[0][0] as ChatMessage[];
    expect(summarizedInput).toHaveLength(4);
    expect(summarizedInput[0].content).toBe('message 1');
    expect(summarizedInput[3].content).toBe('message 4');
  });

  it('records upto_message_id as the id of the last folded message', async () => {
    const db = createDb(makeBackend());
    const summarize = vi.fn(async () => 'sum');
    const compactor = createCompactor({ db, summarize });
    const list = msgs(KEEP_RECENT_MESSAGES + 4); // ids 1..14, folds 1..4

    const result = await compactor.compact(list);

    expect(result?.uptoMessageId).toBe(4);
    expect(result?.content).toBe('sum');
    const stored = await compactor.getLatestSummary();
    expect(stored).toEqual({ uptoMessageId: 4, content: 'sum' });
  });

  it('includes the existing summary in the next summarize input (cumulative summary)', async () => {
    const db = createDb(makeBackend());
    const summarize = vi.fn()
      .mockResolvedValueOnce('first summary')
      .mockResolvedValueOnce('second summary');
    const compactor = createCompactor({ db, summarize });

    // 첫 압축: 1..14 -> 1..4 fold
    await compactor.compact(msgs(KEEP_RECENT_MESSAGES + 4));

    // 두 번째 압축: 이제 5..8 도 접힐 대상. 새 목록은 5..18 (14개).
    const secondList = msgs(KEEP_RECENT_MESSAGES + 4, { content: (i) => `message ${i + 4}` })
      .map((m, idx) => ({ ...m, id: idx + 5 }));
    const result = await compactor.compact(secondList);

    expect(result?.uptoMessageId).toBe(8);
    const secondInput = summarize.mock.calls[1][0] as ChatMessage[];
    // 기존 요약이 별도 항목으로 포함되어야 한다
    expect(secondInput[0].content).toContain('first summary');
    // 그 뒤로 실제로 접힌 메시지들이 온다
    expect(secondInput.slice(1).map(m => m.content)).toEqual(['message 5', 'message 6', 'message 7', 'message 8']);
  });

  it('returns null and stores nothing when there is nothing to fold', async () => {
    const db = createDb(makeBackend());
    const summarize = vi.fn(async () => 'sum');
    const compactor = createCompactor({ db, summarize });
    const list = msgs(KEEP_RECENT_MESSAGES);

    const result = await compactor.compact(list);

    expect(result).toBeNull();
    expect(summarize).not.toHaveBeenCalled();
    expect(await compactor.getLatestSummary()).toBeNull();
  });

  // 빈 요약을 저장하면 접힌 메시지가 근거 없이 화면과 모델에서 사라진다.
  // 이 백엔드는 실제로 빈 응답을 준 전례가 있다(SSE 파서 버그).
  it('stores nothing when the summarizer returns empty or whitespace', async () => {
    for (const empty of ['', '   \n  ']) {
      const db = createDb(makeBackend());
      const summarize = vi.fn(async () => empty);
      const compactor = createCompactor({ db, summarize });

      const result = await compactor.compact(msgs(KEEP_RECENT_MESSAGES + 4));

      expect(summarize).toHaveBeenCalled();
      expect(result).toBeNull();
      expect(await compactor.getLatestSummary()).toBeNull();
    }
  });

  it('returns null when the oldest-to-fold message has no id yet', async () => {
    const db = createDb(makeBackend());
    const summarize = vi.fn(async () => 'sum');
    const compactor = createCompactor({ db, summarize });
    const list = msgs(KEEP_RECENT_MESSAGES + 4, { withIds: false });

    const result = await compactor.compact(list);

    expect(result).toBeNull();
    expect(summarize).not.toHaveBeenCalled();
  });
});
