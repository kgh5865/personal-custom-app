<script lang="ts">
  import { onMount } from 'svelte';
  import {
    getOAuth, setApiKeyMode, clearAuth, getAuthMode,
    preparePkce, providePastedCode, cancelPendingCode,
    type AuthMode,
  } from '../lib/oauth';

  let mode: AuthMode | null = null;
  let apiKey = '';
  let pastedCode = '';
  let awaitingCode = false;
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
      await preparePkce();
      const o = await getOAuth();
      // login() 은 waitForCode() 에서 대기 — 그 사이 UI 는 붙여넣기 입력을 노출
      awaitingCode = true;
      const p = o.login();
      await refresh(); // 브라우저 열림 직후 상태는 아직 이전 그대로
      await p;
      awaitingCode = false;
      pastedCode = '';
      await refresh();
    } catch (e: any) {
      error = e?.message ?? String(e);
      awaitingCode = false;
    } finally {
      busy = false;
    }
  }

  function submitCode() {
    if (!pastedCode.trim()) return;
    providePastedCode(pastedCode.trim());
  }

  function cancelLogin() {
    cancelPendingCode();
    awaitingCode = false;
    pastedCode = '';
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

<div class="px-5 pt-4 pb-8 space-y-6 max-w-xl">
  <header class="pt-3 pb-1">
    <h1 class="text-[26px] font-extrabold text-toss-text-strong tracking-tight leading-tight">
      설정
    </h1>
  </header>

  <section class="bg-toss-surface rounded-toss-card p-5 space-y-4">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-toss-chip bg-toss-blue-light flex items-center justify-center">
        <span class="msym text-toss-blue" style="font-size: 22px;">smart_toy</span>
      </div>
      <div class="flex-1 min-w-0">
        <h2 class="font-bold text-[16px] text-toss-text-strong tracking-tight">ChatGPT 연동</h2>
        <p class="text-[13px] text-toss-text-weak font-medium truncate mt-0.5">{modeLabel(mode)}</p>
      </div>
    </div>

    {#if !mode}
      <div class="space-y-3 pt-1">
        {#if !awaitingCode}
          <button
            on:click={loginOAuth}
            disabled={busy}
            class="md-ripple w-full bg-toss-blue text-white rounded-toss-btn h-[54px] font-bold text-[17px]
                   hover:bg-toss-blue-hover disabled:bg-toss-bg-soft disabled:text-toss-text-disabled"
          >
            ChatGPT로 로그인
          </button>
        {:else}
          <div class="bg-toss-bg-soft rounded-toss-btn p-3 text-[13px] text-toss-text font-medium leading-snug">
            브라우저에서 ChatGPT 로그인을 완료하면 <code>localhost:1455</code> 로 리다이렉트됩니다.
            연결 실패 페이지가 뜨더라도 주소창의 <code>?code=…</code> 값(또는 URL 전체)을 복사해 아래에 붙여넣어 주세요.
          </div>
          <input
            bind:value={pastedCode}
            type="text"
            placeholder="여기에 code 또는 전체 URL 붙여넣기"
            class="w-full bg-toss-bg-soft border-0 rounded-toss-btn px-4 h-12 text-toss-text-strong
                   placeholder:text-toss-text-weak outline-none font-semibold text-[15px]
                   focus:bg-toss-blue-light focus:ring-2 focus:ring-toss-blue"
          />
          <div class="flex gap-2">
            <button
              on:click={submitCode}
              disabled={!pastedCode.trim()}
              class="md-ripple flex-1 bg-toss-blue text-white rounded-toss-btn h-[54px] font-bold text-[17px]
                     hover:bg-toss-blue-hover disabled:bg-toss-bg-soft disabled:text-toss-text-disabled"
            >
              연결하기
            </button>
            <button
              on:click={cancelLogin}
              class="md-ripple bg-toss-bg-soft text-toss-text-strong rounded-toss-btn h-[54px] px-5 font-bold text-[15px]"
            >
              취소
            </button>
          </div>
        {/if}

        <div class="flex items-center gap-3 text-[12px] text-toss-text-weak font-medium py-1">
          <div class="flex-1 h-px bg-toss-line"></div>
          <span>또는</span>
          <div class="flex-1 h-px bg-toss-line"></div>
        </div>

        <input
          bind:value={apiKey}
          type="password"
          placeholder="OpenAI API Key (sk-...)"
          class="w-full bg-toss-bg-soft border-0 rounded-toss-btn px-4 h-12 text-toss-text-strong
                 placeholder:text-toss-text-weak outline-none font-semibold text-[15px]
                 focus:bg-toss-blue-light focus:ring-2 focus:ring-toss-blue"
        />
        <button
          on:click={saveApiKey}
          disabled={busy || !apiKey.trim()}
          class="md-ripple w-full bg-toss-bg-soft text-toss-text-strong rounded-toss-btn h-[54px]
                 font-bold text-[17px] disabled:text-toss-text-disabled"
        >
          API Key로 사용
        </button>
      </div>
    {:else}
      <button
        on:click={logout}
        disabled={busy}
        class="md-ripple w-full bg-toss-bg-soft text-toss-error rounded-toss-btn h-[54px]
               font-bold text-[17px] disabled:opacity-50"
      >
        로그아웃 / 인증 초기화
      </button>
    {/if}

    {#if error}
      <div class="text-toss-error text-[13px] font-medium">{error}</div>
    {/if}
  </section>
</div>
