<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { getFs } from '../lib/fs';
  import { createDomains } from '../lib/domains';
  import { inlineAssets } from '../lib/domainRenderer';
  import { createMessageHost } from '../lib/messaging';
  import { refreshDomains } from '../stores/domains';
  import { profile, loadProfile } from '../stores/profile';

  export let params: { name: string };

  let srcdoc = '';
  let error = '';
  let messageListener: ((e: MessageEvent) => void) | null = null;

  async function load() {
    error = '';
    srcdoc = '';
    try {
      const fs = await getFs();
      const domains = createDomains(fs);
      const files = await domains.read(params.name);
      srcdoc = inlineAssets(files);
    } catch (e: any) {
      error = e?.message ?? String(e);
    }
  }

  async function revert() {
    try {
      const fs = await getFs();
      const domains = createDomains(fs);
      await domains.revert(params.name, 1);
      await load();
    } catch (e: any) {
      error = e?.message ?? String(e);
    }
  }

  async function remove() {
    if (!confirm(`도메인 "${params.name}" 을 삭제할까요?`)) return;
    try {
      const fs = await getFs();
      const domains = createDomains(fs);
      await domains.delete(params.name);
      await refreshDomains();
      history.back();
    } catch (e: any) {
      error = e?.message ?? String(e);
    }
  }

  onMount(async () => {
    await loadProfile();
    await load();
    // Set up message host for iframe → host RPC calls
    const host = createMessageHost({
      get_user_profile: async () => $profile,
      // Future: query_data, set_notification, etc.
    });
    messageListener = (e: MessageEvent) => host.handle(e as any);
    window.addEventListener('message', messageListener);
  });

  onDestroy(() => {
    if (messageListener) {
      window.removeEventListener('message', messageListener);
    }
  });
</script>

<div class="flex items-center gap-2 p-2 border-b bg-gray-50">
  <button on:click={() => history.back()} class="text-blue-600">← 뒤로</button>
  <div class="flex-1 font-semibold truncate">{params.name}</div>
  <button on:click={revert} class="text-sm text-gray-600 underline">되돌리기</button>
  <button on:click={remove} class="text-sm text-red-600 underline">삭제</button>
</div>

{#if error}
  <div class="p-4 text-red-500">{error}</div>
{:else if srcdoc}
  <iframe
    {srcdoc}
    class="w-full"
    style="height: calc(100vh - 100px); border: 0;"
    sandbox="allow-scripts allow-same-origin"
    title={params.name}
  ></iframe>
{:else}
  <div class="p-4 text-gray-500">로딩 중...</div>
{/if}
