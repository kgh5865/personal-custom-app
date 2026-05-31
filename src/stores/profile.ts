import { writable } from 'svelte/store';
import { getDb } from '../lib/db';

export interface UserProfile {
  birthYear?: number;
  region?: string;
  job?: string;
  income?: number;
  married?: boolean;
  children?: number;
  notes?: string;
}

export const profile = writable<UserProfile>({});

export async function loadProfile() {
  const db = await getDb();
  const { rows } = await db.query('SELECT data FROM user_profile WHERE id = 1');
  if (rows.length > 0) {
    profile.set(JSON.parse((rows[0] as { data: string }).data));
  }
}

export async function saveProfile(p: UserProfile) {
  const db = await getDb();
  const now = Date.now();
  await db.execute(
    `INSERT INTO user_profile (id, data, updated_at) VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    [JSON.stringify(p), now]
  );
  profile.set(p);
}
