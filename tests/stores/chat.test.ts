import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import type { Db, DbBackend } from '../../src/lib/db';
import { createDb } from '../../src/lib/db';

// stores/chat.ts (그리고 그 아래 lib/compact.ts) 는 프로덕션 getDb() 싱글턴을 쓰므로
// 인메모리 백엔드로 갈아끼운다.
function makeBackend() {
  let historyRows: any[] = [];
  let summaryRows: any[] = [];
  let historyId = 0;
  let summaryId = 0;
  const backend: DbBackend = {
    async execute(sql: string, params: any[] = []) {
      if (sql.startsWith('CREATE TABLE')) return;
      if (sql.startsWith('INSERT INTO chat_history')) {
        historyId++;
        const [role, content, created_at] = params;
        historyRows.push({ id: historyId, role, content, created_at });
        return;
      }
      if (sql.startsWith('DELETE FROM chat_history')) {
        historyRows = [];
        return;
      }
      if (sql.startsWith('INSERT INTO chat_summary')) {
        summaryId++;
        const [upto_message_id, content, created_at] = params;
        summaryRows.push({ id: summaryId, upto_message_id, content, created_at });
        return;
      }
      if (sql.startsWith('DELETE FROM chat_summary')) {
        summaryRows = [];
        return;
      }
      throw new Error(`unsupported execute: ${sql}`);
    },
    async query(sql: string) {
      if (sql.startsWith('SELECT id, role, content FROM chat_history ORDER BY id DESC')) {
        const m = sql.match(/LIMIT (\d+)/);
        const limit = m ? parseInt(m[1], 10) : historyRows.length;
        return { rows: [...historyRows].sort((a, b) => b.id - a.id).slice(0, limit) };
      }
      if (sql === 'SELECT id FROM chat_history ORDER BY id DESC LIMIT 1') {
        const sorted = [...historyRows].sort((a, b) => b.id - a.id);
        return { rows: sorted.length ? [{ id: sorted[0].id }] : [] };
      }
      if (sql.startsWith('SELECT upto_message_id, content FROM chat_summary')) {
        const sorted = [...summaryRows].sort((a, b) => b.id - a.id);
        return { rows: sorted.length ? [sorted[0]] : [] };
      }
      throw new Error(`unsupported query: ${sql}`);
    },
  };
  return { backend };
}

let testDb: Db;

vi.mock('../../src/lib/db', async () => {
  const actual = await vi.importActual<typeof import('../../src/lib/db')>('../../src/lib/db');
  return { ...actual, getDb: async () => testDb };
});

describe('stores/chat', () => {
  beforeEach(async () => {
    const { backend } = makeBackend();
    testDb = createDb(backend);
    // 모듈은 테스트 간 캐시되므로(ESM 싱글턴) 스토어 상태를 직접 초기화한다.
    const { messages, summary } = await import('../../src/stores/chat');
    messages.set([]);
    summary.set(null);
  });

  it('loadHistory returns the latest N messages in ascending order (regression: was oldest-first)', async () => {
    const { appendMessage, loadHistory, messages } = await import('../../src/stores/chat');
    for (let i = 1; i <= 201; i++) {
      await appendMessage({ role: 'user', content: `msg ${i}` });
    }
    await loadHistory();
    const rows = get(messages);
    expect(rows.length).toBe(200);
    // oldest kept should be msg 2 (msg 1 fell off the 200 cap), newest is msg 201
    expect(rows[0].content).toBe('msg 2');
    expect(rows[rows.length - 1].content).toBe('msg 201');
  });

  it('loadHistory hides messages already folded into a summary', async () => {
    const { appendMessage, loadHistory, messages, summary, compactHistory } = await import('../../src/stores/chat');
    for (let i = 1; i <= 12; i++) {
      await appendMessage({ role: 'user', content: `msg ${i}` });
    }
    await compactHistory(async () => 'summary text');
    await loadHistory();
    const rows = get(messages);
    expect(get(summary)?.content).toBe('summary text');
    expect(rows.every(r => r.content !== 'msg 1')).toBe(true);
    expect(rows[rows.length - 1].content).toBe('msg 12');
  });

  it('appendMessage attaches the inserted row id', async () => {
    const { appendMessage, messages } = await import('../../src/stores/chat');
    await appendMessage({ role: 'user', content: 'hi' });
    const rows = get(messages);
    expect(rows[0].id).toBe(1);
  });

  it('clearHistory empties chat_history and chat_summary and resets stores', async () => {
    const { appendMessage, clearHistory, compactHistory, messages, summary } = await import('../../src/stores/chat');
    for (let i = 1; i <= 12; i++) {
      await appendMessage({ role: 'user', content: `msg ${i}` });
    }
    await compactHistory(async () => 'summary text');
    await clearHistory();
    expect(get(messages)).toEqual([]);
    expect(get(summary)).toBeNull();
  });
});
