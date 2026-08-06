import { writable } from 'svelte/store';
import { getFs } from '../lib/fs';
import { getDb } from '../lib/db';
import { createDomains, type DomainMeta } from '../lib/domains';

export const domainList = writable<DomainMeta[]>([]);

export async function refreshDomains() {
  const fs = await getFs();
  const db = await getDb();
  const d = createDomains(fs, db);
  domainList.set(await d.list());
}
