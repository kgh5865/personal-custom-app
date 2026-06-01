import { writable } from 'svelte/store';

export const domainList = writable<any[]>([]);

export async function refreshDomains() { /* stub - filled in Task 20 */ }
