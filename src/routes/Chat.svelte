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

<div class="flex flex-col" style="height: calc(100vh - 56px);">
  <div class="flex-1 overflow-y-auto p-3 space-y-2">
    {#each $messages as m}
      <div class={m.role === 'user' ? 'text-right' : 'text-left'}>
        <span
          class="inline-block max-w-xs px-3 py-2 rounded whitespace-pre-wrap break-words
                 {m.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-100'}"
        >
          {m.content}
        </span>
      </div>
    {/each}
    {#if busy}<div class="text-gray-400 text-sm">...생각 중</div>{/if}
    {#if error}<div class="text-red-500 text-sm">{error}</div>{/if}
  </div>
  <div class="border-t p-2 flex gap-2 bg-white">
    <input
      bind:value={input}
      on:keydown={onKey}
      disabled={busy}
      class="flex-1 border rounded px-2 py-1"
      placeholder="GPT에게 말하기"
    />
    <button on:click={send} disabled={busy} class="bg-blue-600 text-white px-3 rounded disabled:opacity-50">
      전송
    </button>
  </div>
</div>
