import { writable, get } from 'svelte/store';
import { getDb } from '../lib/db';
import { getLatestSummary, createCompactor, type StoredSummary } from '../lib/compact';
import type { ChatMessage } from '../lib/gpt/bridge';

export const messages = writable<ChatMessage[]>([]);
export const summary = writable<StoredSummary | null>(null);

export async function loadHistory() {
  const db = await getDb();
  const latestSummary = await getLatestSummary(db);
  summary.set(latestSummary);
  // 최신 N개를 가져와 시간순으로 정렬한다. 오래된 순으로 200개 제한을 걸면
  // 대화가 200개를 넘는 순간 최근 메시지가 잘려나간다.
  const { rows } = await db.query(
    'SELECT id, role, content FROM chat_history ORDER BY id DESC LIMIT 200'
  );
  const recent = (rows as ChatMessage[]).reverse();
  messages.set(
    latestSummary ? recent.filter(m => (m.id ?? 0) > latestSummary.uptoMessageId) : recent
  );
}

export async function appendMessage(m: ChatMessage) {
  const db = await getDb();
  await db.execute(
    'INSERT INTO chat_history (role, content, created_at) VALUES (?, ?, ?)',
    [m.role, m.content, Date.now()]
  );
  const { rows } = await db.query('SELECT id FROM chat_history ORDER BY id DESC LIMIT 1');
  const withId: ChatMessage = { ...m, id: rows[0]?.id };
  messages.update(arr => [...arr, withId]);
}

export async function clearHistory() {
  const db = await getDb();
  await db.execute('DELETE FROM chat_history');
  await db.execute('DELETE FROM chat_summary');
  messages.set([]);
  summary.set(null);
}

// 자동/수동 압축 공통 경로. summarize 는 호출부가 주입한다(프로덕션은 createSummarizer(openai)).
// 접을 메시지가 없으면 null 을 반환하고 아무것도 바뀌지 않는다.
export async function compactHistory(
  summarize: (messages: ChatMessage[]) => Promise<string>
): Promise<{ foldedCount: number } | null> {
  const db = await getDb();
  const current = get(messages);
  const folded = await createCompactor({ db, summarize }).compact(current);
  if (!folded) return null;
  summary.set(folded);
  const foldedCount = current.filter(m => (m.id ?? 0) <= folded.uptoMessageId).length;
  messages.update(arr => arr.filter(m => (m.id ?? 0) > folded.uptoMessageId));
  return { foldedCount };
}
