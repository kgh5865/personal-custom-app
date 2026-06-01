import { writable } from 'svelte/store';
import { getDb } from '../lib/db';
import type { ChatMessage } from '../lib/gpt/bridge';

export const messages = writable<ChatMessage[]>([]);

export async function loadHistory() {
  const db = await getDb();
  const { rows } = await db.query(
    'SELECT role, content FROM chat_history ORDER BY id ASC LIMIT 200'
  );
  messages.set(rows as ChatMessage[]);
}

export async function appendMessage(m: ChatMessage) {
  const db = await getDb();
  await db.execute(
    'INSERT INTO chat_history (role, content, created_at) VALUES (?, ?, ?)',
    [m.role, m.content, Date.now()]
  );
  messages.update(arr => [...arr, m]);
}

export async function clearHistory() {
  const db = await getDb();
  await db.execute('DELETE FROM chat_history');
  messages.set([]);
}
