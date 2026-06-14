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

  // Re-load whenever params.name changes (router reuses the component instance
  // when navigating between /domain/foo and /domain/bar). This also fires on
  // initial mount, so onMount doesn't need to call load() separately.
  $: if (params?.name) load();

  onMount(async () => {
    await loadProfile();
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

<header class="flex items-center gap-1 px-2 py-2 bg-surface border-b border-outline-variant">
  <button on:click={() => history.back()} class="md-ripple w-12 h-12 flex items-center justify-center rounded-full" aria-label="뒤로">
    <span class="msym text-on-surface">arrow_back</span>
  </button>
  <div class="flex-1 font-medium text-on-surface truncate">{params.name}</div>
  <button on:click={revert} class="md-ripple w-12 h-12 flex items-center justify-center rounded-full" aria-label="되돌리기">
    <span class="msym text-on-surface">undo</span>
  </button>
  <button on:click={remove} class="md-ripple w-12 h-12 flex items-center justify-center rounded-full text-md-error" aria-label="삭제">
    <span class="msym">delete</span>
  </button>
</header>

{#if error}
  <div class="p-4 text-md-error">{error}</div>
{:else if srcdoc}
  <iframe
    {srcdoc}
    class="w-full"
    style="height: calc(100vh - 56px); border: 0;"
    sandbox="allow-scripts"
    title={params.name}
  ></iframe>
{:else}
  <div class="p-4 text-on-surface-variant">로딩 중...</div>
{/if}
