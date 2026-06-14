<script lang="ts">
  import { onMount } from 'svelte';
  import { messages, loadHistory, appendMessage } from '../stores/chat';
  import { getOpenAIClient } from '../lib/openai';
  import { createBridge } from '../lib/gpt/bridge';
  import { createRegistry } from '../lib/gpt/registry';
  import { TOOL_SCHEMAS } from '../lib/gpt/tools';
  import { createDomains } from '../lib/domains';
  import { getFs } from '../lib/fs';
  import { loadProfile, profile, saveProfile } from '../stores/profile';

  let input = '';
  let busy = false;
  let error = '';

  onMount(async () => {
    try {
      await loadHistory();
      await loadProfile();
    } catch (e: any) {
      error = `초기화 실패: ${e?.message ?? e}`;
    }
  });

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
      const domains = createDomains(fs);
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
      // Note: pass history WITHOUT the just-appended user message; bridge prepends it
      const priorHistory = $messages.slice(0, -1);
      const r = await bridge.send(priorHistory, userMsg);

      await appendMessage({ role: 'assistant', content: r.text || '(빈 응답)' });

      // If GPT touched domains, refresh the domain list (used by Home screen)
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

<div class="flex flex-col" style="height: calc(100vh - 80px);">
  <header class="px-4 pt-3 pb-2">
    <h1 class="text-2xl font-medium text-on-surface">챗</h1>
  </header>

  <div class="flex-1 overflow-y-auto px-3 pb-2 space-y-3">
    {#each $messages as m}
      <div class={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
        <div
          class="max-w-[80%] px-4 py-2.5 whitespace-pre-wrap break-words shadow-md-1
                 {m.role === 'user'
                    ? 'bg-primary text-on-primary rounded-md-xl rounded-br-md-sm'
                    : 'bg-surface-container text-on-surface rounded-md-xl rounded-bl-md-sm'}"
        >
          {m.content}
        </div>
      </div>
    {/each}
    {#if busy}
      <div class="flex justify-start">
        <div class="bg-surface-container px-4 py-2.5 rounded-md-xl flex items-center gap-2">
          <span class="msym text-on-surface-variant animate-spin" style="font-size: 18px;">progress_activity</span>
          <span class="text-sm text-on-surface-variant">생각 중...</span>
        </div>
      </div>
    {/if}
    {#if error}
      <div class="text-md-error text-sm px-2">{error}</div>
    {/if}
  </div>

  <div class="border-t border-outline-variant px-3 py-3 bg-surface">
    <div class="flex items-end gap-2">
      <div class="flex-1 bg-surface-container-high rounded-md-xl px-4 py-2.5">
        <input
          bind:value={input}
          on:keydown={onKey}
          disabled={busy}
          class="w-full bg-transparent outline-none text-on-surface placeholder:text-on-surface-variant"
          placeholder="GPT에게 말하기"
        />
      </div>
      <button
        on:click={send}
        disabled={busy || !input.trim()}
        class="md-ripple bg-primary text-on-primary rounded-full w-12 h-12 flex items-center justify-center shadow-md-1 disabled:opacity-40"
        aria-label="전송"
      >
        <span class="msym">send</span>
      </button>
    </div>
  </div>
</div>
