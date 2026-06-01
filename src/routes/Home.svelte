<script lang="ts">
  import { onMount } from 'svelte';
  import { link } from 'svelte-spa-router';
  import { domainList, refreshDomains } from '../stores/domains';

  onMount(refreshDomains);
</script>

<div class="p-4 space-y-3">
  <h1 class="text-xl font-bold">홈</h1>
  {#if $domainList.length === 0}
    <p class="text-gray-500">등록된 도메인이 없습니다. 챗에서 GPT에게 만들어달라고 하세요.</p>
  {/if}
  <div class="grid grid-cols-2 gap-3">
    {#each $domainList as d}
      <a
        use:link
        href={`/domain/${d.name}`}
        class="border rounded p-3 hover:bg-gray-50 block"
      >
        <div class="text-2xl">{d.icon ?? '📄'}</div>
        <div class="font-semibold">{d.displayName}</div>
        <div class="text-xs text-gray-400">{d.name}</div>
      </a>
    {/each}
  </div>
</div>
