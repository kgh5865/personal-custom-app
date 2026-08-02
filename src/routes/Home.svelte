<script lang="ts">
  import { onMount } from 'svelte';
  import { link } from 'svelte-spa-router';
  import { domainList, refreshDomains } from '../stores/domains';

  onMount(refreshDomains);
</script>

<div class="px-5 pt-4 pb-6 space-y-7">
  <header class="pt-3 pb-1">
    <h1 class="text-[26px] font-extrabold text-toss-text-strong tracking-tight leading-tight">
      홈
    </h1>
    <p class="text-[15px] text-toss-text mt-1 font-medium">
      개인 맞춤 화면들이 여기 모입니다.
    </p>
  </header>

  {#if $domainList.length === 0}
    <div class="bg-toss-surface rounded-toss-card px-6 py-10 text-center space-y-3">
      <div class="w-14 h-14 mx-auto rounded-full bg-toss-blue-light flex items-center justify-center">
        <span class="msym text-toss-blue" style="font-size: 28px;">add</span>
      </div>
      <p class="text-toss-text-strong font-bold text-[16px]">아직 등록된 화면이 없어요</p>
      <p class="text-[14px] text-toss-text-weak font-medium leading-relaxed">
        챗에서 GPT에게 원하는 화면을<br/>만들어달라고 말해보세요.
      </p>
      <a
        use:link
        href="/chat"
        class="md-ripple inline-flex items-center justify-center mt-2 h-12 px-6 rounded-toss-btn bg-toss-blue text-white font-bold text-[15px]"
      >
        챗으로 가기
      </a>
    </div>
  {:else}
    <section class="space-y-2">
      <h2 class="px-1 text-[13px] font-bold text-toss-text-weak tracking-tight">
        내 화면 {$domainList.length}
      </h2>
      <div class="bg-toss-surface rounded-toss-card overflow-hidden">
        {#each $domainList as d, i}
          <a
            use:link
            href={`/domain/${d.name}`}
            class="md-ripple flex items-center gap-4 px-4 py-4 active:bg-toss-bg-soft
                   {i !== 0 ? 'border-t border-toss-line' : ''}"
          >
            <div class="w-11 h-11 rounded-toss-chip bg-toss-blue-light flex items-center justify-center text-[22px] shrink-0">
              {d.icon ?? '📄'}
            </div>
            <div class="flex-1 min-w-0">
              <div class="font-bold text-[16px] text-toss-text-strong truncate tracking-tight">
                {d.displayName}
              </div>
              <div class="text-[13px] text-toss-text-weak font-medium truncate mt-0.5">
                {d.name}
              </div>
            </div>
            <span class="msym text-toss-text-weak shrink-0" style="font-size: 20px;">chevron_right</span>
          </a>
        {/each}
      </div>
    </section>
  {/if}
</div>
