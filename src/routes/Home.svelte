<script lang="ts">
  import { onMount } from 'svelte';
  import { link } from 'svelte-spa-router';
  import { domainList, refreshDomains } from '../stores/domains';

  onMount(refreshDomains);
</script>

<div class="p-4 space-y-4">
  <header class="pt-2">
    <h1 class="text-2xl font-medium text-on-surface">홈</h1>
    <p class="text-sm text-on-surface-variant mt-1">개인 맞춤 화면들이 여기 모입니다.</p>
  </header>

  {#if $domainList.length === 0}
    <div class="bg-surface-container-high rounded-md-lg p-6 text-center space-y-2">
      <span class="msym text-on-surface-variant" style="font-size: 48px;">add_circle</span>
      <p class="text-on-surface-variant">등록된 도메인이 없습니다.</p>
      <p class="text-sm text-on-surface-variant">챗에서 GPT에게 만들어달라고 하세요.</p>
    </div>
  {:else}
    <div class="grid grid-cols-2 gap-3">
      {#each $domainList as d}
        <a
          use:link
          href={`/domain/${d.name}`}
          class="md-ripple bg-surface-container rounded-md-lg p-4 block shadow-md-1"
        >
          <div class="text-3xl mb-2">{d.icon ?? '📄'}</div>
          <div class="font-medium text-on-surface">{d.displayName}</div>
          <div class="text-xs text-on-surface-variant mt-1">{d.name}</div>
        </a>
      {/each}
    </div>
  {/if}
</div>
