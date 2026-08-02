<script lang="ts">
  import { onMount } from 'svelte';
  import { Capacitor } from '@capacitor/core';
  import {
    getOAuth, setApiKeyMode, setGatewayMode, clearAuth, getAuthMode,
    preparePkce, providePastedCode, cancelPendingCode,
    type AuthMode,
  } from '../lib/oauth';

  type Provider = 'chatgpt' | 'apikey' | 'openclaw';

  const isAndroid = Capacitor.getPlatform() === 'android';
  let mode: AuthMode | null = null;
  let selected: Provider = 'chatgpt';
  let apiKey = '';
  let gatewayURL = 'http://home-server-1:18789';
  let gatewayToken = '';
  let gatewayModel = 'openclaw/default';
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
      awaitingCode = true;
      const p = o.login();
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

  async function saveGateway() {
    if (!gatewayURL.trim() || !gatewayToken.trim()) return;
    busy = true; error = '';
    try {
      const model = gatewayModel.trim() || 'openclaw/default';
      await setGatewayMode(gatewayURL.trim(), gatewayToken.trim(), model);
      gatewayToken = '';
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

  function hostOf(url: string): string {
    try { return new URL(url).host; } catch { return url; }
  }

  function modeLabel(m: AuthMode | null): string {
    if (!m) return '미연동';
    if (m.mode === 'apikey') return `OpenAI API Key 사용 중 (sk-...${m.apiKey.slice(-4)})`;
    if (m.mode === 'gateway') {
      const fromEnv = !!import.meta.env.VITE_OPENCLAW_TOKEN
        && m.baseURL === import.meta.env.VITE_OPENCLAW_URL;
      return `OpenClaw 게이트웨이${fromEnv ? ' (.env)' : ''} 사용 중 (${hostOf(m.baseURL)})`;
    }
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
        <h2 class="font-bold text-[16px] text-toss-text-strong tracking-tight">AI 연동</h2>
        <p class="text-[13px] text-toss-text-weak font-medium truncate mt-0.5">{modeLabel(mode)}</p>
      </div>
    </div>

    {#if mode}
      <button
        on:click={logout}
        disabled={busy}
        class="md-ripple w-full bg-toss-bg-soft text-toss-error rounded-toss-btn h-[54px]
               font-bold text-[17px] disabled:opacity-50"
      >
        로그아웃 / 인증 초기화
      </button>
    {:else}
      <!-- Provider tabs -->
      <div class="flex gap-2 bg-toss-bg-soft rounded-toss-btn p-1">
        {#each [
          { id: 'chatgpt' as Provider, label: 'ChatGPT' },
          { id: 'apikey' as Provider,  label: 'API Key' },
          { id: 'openclaw' as Provider, label: 'OpenClaw' },
        ] as tab}
          <button
            on:click={() => (selected = tab.id)}
            class="flex-1 h-10 rounded-toss-btn font-bold text-[13px] transition
                   {selected === tab.id
                     ? 'bg-toss-surface text-toss-blue shadow-sm'
                     : 'text-toss-text-weak'}"
          >
            {tab.label}
          </button>
        {/each}
      </div>

      {#if selected === 'chatgpt'}
        <div class="space-y-3 pt-1">
          <p class="text-[12px] text-toss-text-weak font-medium leading-snug">
            {#if isAndroid}
              ChatGPT 계정으로 로그인. 브라우저에서 승인하면 앱이 자동으로 돌아옵니다.
            {:else}
              브라우저 개발 모드: 로그인 후 리다이렉트 URL 을 붙여넣어야 합니다.
            {/if}
          </p>
          {#if !awaitingCode}
            <button
              on:click={loginOAuth}
              disabled={busy}
              class="md-ripple w-full bg-toss-blue text-white rounded-toss-btn h-[54px] font-bold text-[17px]
                     hover:bg-toss-blue-hover disabled:bg-toss-bg-soft disabled:text-toss-text-disabled"
            >
              ChatGPT로 로그인
            </button>
          {:else if isAndroid}
            <div class="bg-toss-bg-soft rounded-toss-btn p-4 text-center space-y-2">
              <div class="msym text-toss-blue animate-spin" style="font-size:24px">progress_activity</div>
              <p class="text-[13px] text-toss-text font-medium">브라우저에서 로그인 완료를 기다리는 중...</p>
              <p class="text-[11px] text-toss-text-weak">승인 후 자동으로 돌아옵니다.</p>
            </div>
            <button
              on:click={cancelLogin}
              class="md-ripple w-full bg-toss-bg-soft text-toss-text-strong rounded-toss-btn h-[54px] font-bold text-[15px]"
            >
              취소
            </button>
          {:else}
            <div class="bg-toss-bg-soft rounded-toss-btn p-3 text-[13px] text-toss-text font-medium leading-snug">
              브라우저에서 로그인을 완료하면 <code>localhost:1455</code> 로 리다이렉트됩니다.
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
        </div>
      {:else if selected === 'apikey'}
        <div class="space-y-3 pt-1">
          <p class="text-[12px] text-toss-text-weak font-medium leading-snug">
            OpenAI API Key (sk-...) 를 직접 입력. 가장 안정적으로 동작하지만 사용량만큼 과금됨.
          </p>
          <input
            bind:value={apiKey}
            type="password"
            placeholder="sk-..."
            class="w-full bg-toss-bg-soft border-0 rounded-toss-btn px-4 h-12 text-toss-text-strong
                   placeholder:text-toss-text-weak outline-none font-semibold text-[15px]
                   focus:bg-toss-blue-light focus:ring-2 focus:ring-toss-blue"
          />
          <button
            on:click={saveApiKey}
            disabled={busy || !apiKey.trim()}
            class="md-ripple w-full bg-toss-blue text-white rounded-toss-btn h-[54px]
                   font-bold text-[17px] disabled:bg-toss-bg-soft disabled:text-toss-text-disabled"
          >
            API Key 로 사용
          </button>
        </div>
      {:else}
        <div class="space-y-3 pt-1">
          <p class="text-[12px] text-toss-text-weak font-medium leading-snug">
            셀프 호스트 OpenAI 호환 게이트웨이(OpenClaw). Tailscale 등 사설 경로 전용.
          </p>
          <input
            bind:value={gatewayURL}
            type="text"
            placeholder="게이트웨이 URL (예: http://home-server-1:18789)"
            class="w-full bg-toss-bg-soft border-0 rounded-toss-btn px-4 h-12 text-toss-text-strong
                   placeholder:text-toss-text-weak outline-none font-semibold text-[15px]
                   focus:bg-toss-blue-light focus:ring-2 focus:ring-toss-blue"
          />
          <input
            bind:value={gatewayToken}
            type="password"
            placeholder="Bearer 토큰"
            class="w-full bg-toss-bg-soft border-0 rounded-toss-btn px-4 h-12 text-toss-text-strong
                   placeholder:text-toss-text-weak outline-none font-semibold text-[15px]
                   focus:bg-toss-blue-light focus:ring-2 focus:ring-toss-blue"
          />
          <input
            bind:value={gatewayModel}
            type="text"
            placeholder="모델명 (기본: openclaw/default)"
            class="w-full bg-toss-bg-soft border-0 rounded-toss-btn px-4 h-12 text-toss-text-strong
                   placeholder:text-toss-text-weak outline-none font-semibold text-[15px]
                   focus:bg-toss-blue-light focus:ring-2 focus:ring-toss-blue"
          />
          <button
            on:click={saveGateway}
            disabled={busy || !gatewayURL.trim() || !gatewayToken.trim()}
            class="md-ripple w-full bg-toss-blue text-white rounded-toss-btn h-[54px] font-bold text-[17px]
                   hover:bg-toss-blue-hover disabled:bg-toss-bg-soft disabled:text-toss-text-disabled"
          >
            게이트웨이로 연결
          </button>
        </div>
      {/if}
    {/if}

    {#if error}
      <div class="text-toss-error text-[13px] font-medium">{error}</div>
    {/if}
  </section>
</div>
