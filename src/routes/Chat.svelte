<script lang="ts">
  import { onMount } from 'svelte';
  import { messages, loadHistory, appendMessage } from '../stores/chat';
  import { getOpenAIClient } from '../lib/openai';
  import { createBridge } from '../lib/gpt/bridge';
  import { createRegistry } from '../lib/gpt/registry';
  import { TOOL_SCHEMAS } from '../lib/gpt/tools';
  import { createDomains } from '../lib/domains';
  import { getFs } from '../lib/fs';
  import { getDb } from '../lib/db';
  import { loadProfile, profile, saveProfile } from '../stores/profile';

  let input = '';
  let busy = false;
  let error = '';
  let scrollEl: HTMLDivElement;

  function scrollToBottom() {
    if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
  }

  onMount(async () => {
    try {
      await loadHistory();
      await loadProfile();
    } catch (e: any) {
      error = `초기화 실패: ${e?.message ?? e}`;
    }
    // 히스토리 렌더 후 하단으로
    requestAnimationFrame(scrollToBottom);
    // 키보드 열림/닫힘으로 뷰포트가 줄면 다시 하단으로
    const vv = window.visualViewport;
    if (vv) {
      const onResize = () => requestAnimationFrame(scrollToBottom);
      vv.addEventListener('resize', onResize);
      return () => vv.removeEventListener('resize', onResize);
    }
  });

  // 새 메시지/에러 도착 시 자동 스크롤
  $: if ($messages || busy || error) requestAnimationFrame(scrollToBottom);

  async function send() {
    if (!input.trim() || busy) return;
    const userMsg = input.trim();
    input = '';
    busy = true;
    error = '';
    await appendMessage({ role: 'user', content: userMsg });

    try {
      const openai = await getOpenAIClient();
      const fs = await getFs();
      const db = await getDb();
      const domains = createDomains(fs, db);
      const registry = createRegistry({
        domains,
        getProfile: async () => $profile,
        updateProfile: async (u) => { await saveProfile({ ...$profile, ...u }); },
      });
      const bridge = createBridge({
        openai,
        registry,
        tools: TOOL_SCHEMAS as any,
        systemPrompt:
          '당신은 사용자의 개인 맞춤 생활 관리 앱을 함께 만드는 비서입니다. ' +
          '사용자가 화면 변경을 요청하면 적절한 도구를 호출해 실제로 반영하세요. ' +
          '도메인은 한 사용자의 생활 영역(예: 메모, 정책, 청약)을 의미합니다. ' +
          '한국어로 자연스럽게 응답하세요.',
        maxToolIterations: 5,
      });
      const priorHistory = $messages.slice(0, -1);
      const r = await bridge.send(priorHistory, userMsg);

      await appendMessage({ role: 'assistant', content: r.text || '(빈 응답)' });

      const touched = r.toolEvents.some((e) =>
        ['create_domain', 'delete_domain', 'update_screen', 'patch_screen'].includes(e.name)
      );
      if (touched) {
        const { refreshDomains } = await import('../stores/domains');
        await refreshDomains().catch(() => {});
      }
    } catch (e: any) {
      error = e?.message ?? String(e);
    } finally {
      busy = false;
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }
</script>

<div class="flex flex-col bg-toss-bg" style="height: calc(100vh - 76px);">
  <header class="px-5 pt-4 pb-3">
    <h1 class="text-[26px] font-extrabold text-toss-text-strong tracking-tight">챗</h1>
  </header>

  <div bind:this={scrollEl} class="flex-1 overflow-y-auto px-4 pb-3 space-y-2.5">
    {#each $messages as m}
      <div class={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
        <div
          class="max-w-[82%] px-4 py-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed font-medium
                 {m.role === 'user'
                    ? 'bg-toss-blue text-white rounded-toss-card rounded-br-md'
                    : 'bg-toss-surface text-toss-text-strong rounded-toss-card rounded-bl-md'}"
        >
          {m.content}
        </div>
      </div>
    {/each}
    {#if busy}
      <div class="flex justify-start">
        <div class="bg-toss-surface px-4 py-3 rounded-toss-card flex items-center gap-2">
          <span class="msym text-toss-blue animate-spin" style="font-size: 18px;">progress_activity</span>
          <span class="text-[14px] text-toss-text font-medium">생각 중...</span>
        </div>
      </div>
    {/if}
    {#if error}
      <div class="text-toss-error text-[13px] px-2 font-medium">{error}</div>
    {/if}
  </div>

  <div class="px-4 pt-2 pb-3 bg-toss-bg">
    <div class="flex items-center gap-2">
      <div class="flex-1 bg-toss-surface rounded-toss-btn px-4 h-12 flex items-center border border-toss-line">
        <input
          bind:value={input}
          on:keydown={onKey}
          disabled={busy}
          class="w-full bg-transparent outline-none text-toss-text-strong placeholder:text-toss-text-weak font-medium text-[15px]"
          placeholder="GPT에게 말하기"
        />
      </div>
      <button
        on:click={send}
        disabled={busy || !input.trim()}
        class="md-ripple bg-toss-blue text-white rounded-toss-btn w-12 h-12 flex items-center justify-center
               disabled:bg-toss-bg-soft disabled:text-toss-text-disabled"
        aria-label="전송"
      >
        <span class="msym" style="font-size: 22px;">arrow_upward</span>
      </button>
    </div>
  </div>
</div>
