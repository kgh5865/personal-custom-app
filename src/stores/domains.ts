import { writable } from 'svelte/store';
import { getFs } from '../lib/fs';
import { createDomains, type DomainMeta } from '../lib/domains';

export const domainList = writable<DomainMeta[]>([]);

export async function refreshDomains() {
  const fs = await getFs();
  const d = createDomains(fs);
  domainList.set(await d.list());
}
