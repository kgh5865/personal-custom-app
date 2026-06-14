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

<div class="p-4 space-y-4 max-w-xl">
  <header class="pt-2">
    <h1 class="text-2xl font-medium text-on-surface">설정</h1>
  </header>

  <section class="bg-surface-container rounded-md-lg p-4 space-y-3 shadow-md-1">
    <div class="flex items-center gap-3">
      <span class="msym text-primary">smart_toy</span>
      <h2 class="font-medium text-on-surface">ChatGPT 연동</h2>
    </div>
    <p class="text-sm text-on-surface-variant">현재 상태: {modeLabel(mode)}</p>

    {#if !mode}
      <button
        on:click={loginOAuth}
        disabled={busy}
        class="md-ripple bg-primary text-on-primary rounded-md-xl px-4 py-2.5 w-full font-medium shadow-md-1 disabled:opacity-50"
      >
        ChatGPT로 로그인 (브라우저)
      </button>
      <div class="flex items-center gap-3 text-xs text-on-surface-variant">
        <div class="flex-1 h-px bg-outline-variant"></div>
        <span>또는</span>
        <div class="flex-1 h-px bg-outline-variant"></div>
      </div>
      <input
        bind:value={apiKey}
        type="password"
        placeholder="OpenAI API Key (sk-...)"
        class="w-full bg-surface-container-high border-0 rounded-md-sm px-3 py-2.5 text-on-surface placeholder:text-on-surface-variant outline-none focus:ring-2 focus:ring-primary"
      />
      <button
        on:click={saveApiKey}
        disabled={busy || !apiKey.trim()}
        class="md-ripple bg-secondary-container text-on-secondary-container rounded-md-xl px-4 py-2.5 w-full font-medium disabled:opacity-50"
      >
        API Key로 사용
      </button>
    {:else}
      <button
        on:click={logout}
        disabled={busy}
        class="md-ripple bg-md-error text-on-md-error rounded-md-xl px-4 py-2.5 w-full font-medium shadow-md-1 disabled:opacity-50"
      >
        로그아웃 / 인증 초기화
      </button>
    {/if}

    {#if error}
      <div class="text-md-error text-sm">{error}</div>
    {/if}
  </section>
</div>
