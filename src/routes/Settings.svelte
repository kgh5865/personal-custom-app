<script lang="ts">
  import { onMount } from 'svelte';
  import { getOAuth, setApiKeyMode, clearAuth, getAuthMode, type AuthMode } from '../lib/oauth';

  let mode: AuthMode | null = null;
  let apiKey = '';
  let busy = false;
  let error = '';

  async function refresh() {
    try {
      mode = await getAuthMode();
    } catch (e: any) {
      error = e?.message ?? String(e);
    }
  }

  onMount(refresh);

  async function loginOAuth() {
    busy = true; error = '';
    try {
      const o = await getOAuth();
      await o.login();
      await refresh();
    } catch (e: any) {
      error = e?.message ?? String(e);
    } finally {
      busy = false;
    }
  }

  async function saveApiKey() {
    if (!apiKey.trim()) return;
    busy = true; error = '';
    try {
      await setApiKeyMode(apiKey.trim());
      apiKey = '';
      await refresh();
    } catch (e: any) {
      error = e?.message ?? String(e);
    } finally {
      busy = false;
    }
  }

  async function logout() {
    busy = true; error = '';
    try {
      await clearAuth();
      await refresh();
    } catch (e: any) {
      error = e?.message ?? String(e);
    } finally {
      busy = false;
    }
  }

  function modeLabel(m: AuthMode | null): string {
    if (!m) return '미연동';
    if (m.mode === 'apikey') return `API Key 사용 중 (sk-...${m.apiKey.slice(-4)})`;
    return 'ChatGPT OAuth 연동됨';
  }
</script>

<div class="p-4 space-y-4 max-w-md">
  <h1 class="text-xl font-bold">설정</h1>

  <section class="border rounded p-3 space-y-2">
    <h2 class="font-semibold">ChatGPT 연동</h2>
    <p class="text-sm text-gray-600">현재 상태: {modeLabel(mode)}</p>

    {#if !mode}
      <button
        on:click={loginOAuth}
        disabled={busy}
        class="bg-blue-600 text-white px-3 py-1 rounded w-full disabled:opacity-50"
      >
        ChatGPT로 로그인 (브라우저)
      </button>
      <div class="text-xs text-gray-500 text-center">— 또는 —</div>
      <input
        bind:value={apiKey}
        type="password"
        placeholder="OpenAI API Key (sk-...)"
        class="border rounded px-2 py-1 w-full"
      />
      <button
        on:click={saveApiKey}
        disabled={busy || !apiKey.trim()}
        class="bg-gray-700 text-white px-3 py-1 rounded w-full disabled:opacity-50"
      >
        API Key로 사용
      </button>
    {:else}
      <button
        on:click={logout}
        disabled={busy}
        class="bg-red-600 text-white px-3 py-1 rounded w-full disabled:opacity-50"
      >
        로그아웃 / 인증 초기화
      </button>
    {/if}

    {#if error}
      <div class="text-red-500 text-sm">{error}</div>
    {/if}
  </section>
</div>
