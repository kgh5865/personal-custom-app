<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { link } from 'svelte-spa-router';
  import { messages, loadHistory, appendMessage } from '../stores/chat';
  import { getOpenAIClient, isAuthExpired } from '../lib/openai';
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
  // 실패한 요청의 사용자 메시지. 이 값은 이미 히스토리에 저장돼 있으므로
  // 재시도할 때 다시 append 하면 안 된다 (중복 말풍선이 쌓인다).
  let failedMessage = '';
  // 로그인 만료는 재시도해도 소용없다. 재시도 대신 설정으로 보낸다.
  let authExpired = false;

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
  });

  // 키보드 열림/닫힘으로 뷰포트가 줄면 다시 하단으로.
  // async onMount 가 돌려준 cleanup 은 Svelte 가 무시하므로(반환값이 Promise 다)
  // 등록/해제를 onMount 밖으로 빼야 리스너가 실제로 정리된다.
  const onViewportResize = () => requestAnimationFrame(scrollToBottom);
  onMount(() => {
    window.visualViewport?.addEventListener('resize', onViewportResize);
  });
  onDestroy(() => {
    window.visualViewport?.removeEventListener('resize', onViewportResize);
  });

  // 새 메시지/에러 도착 시 자동 스크롤
  $: if ($messages || busy || error) requestAnimationFrame(scrollToBottom);

  async function send() {
    if (!input.trim() || busy) return;
    const userMsg = input.trim();
    input = '';
    await appendMessage({ role: 'user', content: userMsg });
    await run(userMsg);
  }

  // 실패한 메시지를 다시 보낸다. 히스토리에는 이미 들어 있으므로 append 하지 않는다.
  async function retry() {
    if (busy || !failedMessage) return;
    await run(failedMessage);
  }

  async function run(userMsg: string) {
    busy = true;
    error = '';
    authExpired = false;

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
      // 마지막 항목은 방금(또는 실패했던) 사용자 메시지이므로 제외한다.
      // 재시도 때도 assistant 응답이 안 붙었으니 이 계산은 그대로 성립한다.
      const priorHistory = $messages.slice(0, -1);
      const r = await bridge.send(priorHistory, userMsg);

      await appendMessage({ role: 'assistant', content: r.text || '(빈 응답)' });
      failedMessage = '';

      const touched = r.toolEvents.some((e) =>
        ['create_domain', 'delete_domain', 'update_screen', 'patch_screen'].includes(e.name)
      );
      if (touched) {
        const { refreshDomains } = await import('../stores/domains');
        await refreshDomains().catch(() => {});
      }
    } catch (e: any) {
      error = e?.message ?? String(e);
      authExpired = isAuthExpired(e);
      failedMessage = userMsg;
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
      <div class="bg-toss-surface rounded-toss-card px-4 py-3 space-y-2.5">
        <p class="text-toss-error text-[13px] font-medium break-words">{error}</p>
        {#if authExpired}
          <a
            href="/settings"
            use:link
            class="md-ripple inline-flex items-center gap-1.5 h-9 px-3 rounded-toss-btn
                   bg-toss-blue-light text-toss-blue font-bold text-[13px]"
          >
            <span class="msym" style="font-size: 18px;">login</span>
            설정에서 다시 로그인
          </a>
        {:else if failedMessage && !busy}
          <button
            on:click={retry}
            class="md-ripple flex items-center gap-1.5 h-9 px-3 rounded-toss-btn
                   bg-toss-blue-light text-toss-blue font-bold text-[13px]"
          >
            <span class="msym" style="font-size: 18px;">refresh</span>
            재시도
          </button>
        {/if}
      </div>
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
