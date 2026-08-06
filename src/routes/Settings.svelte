<script lang="ts">
  import { onMount } from 'svelte';
  import { Capacitor } from '@capacitor/core';
  import {
    getOAuth, setApiKeyMode, setGatewayMode, clearAuth, getAuthMode,
    preparePkce, providePastedCode, cancelPendingCode,
    type AuthMode,
  } from '../lib/oauth';
  import {
    APP_VERSION, checkForUpdate, downloadAndInstall,
    type UpdateCheck, type DownloadProgress,
  } from '../lib/update';
  import {
    getAiSettings, setAiSettings, MODEL_OPTIONS, supportsReasoning,
    type AiSettings, type ReasoningEffort,
  } from '../lib/ai-settings';
  import { getFs } from '../lib/fs';
  import { getDb } from '../lib/db';
  import { createDomains, type TrashEntry } from '../lib/domains';
  import { refreshDomains } from '../stores/domains';

  type Provider = 'chatgpt' | 'apikey' | 'openclaw';

  const isAndroid = Capacitor.getPlatform() === 'android';
  let mode: AuthMode | null = null;
  let selected: Provider = 'chatgpt';
  let apiKey = '';
  let gatewayURL = import.meta.env.VITE_OPENCLAW_URL ?? '';
  let gatewayToken = import.meta.env.VITE_OPENCLAW_TOKEN ?? '';
  let gatewayModel = import.meta.env.VITE_OPENCLAW_MODEL ?? 'openclaw/default';
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

  // ─── 앱 자동 업데이트 ─────────────────────────────────────────
  let updateCheck: UpdateCheck | null = null;
  let updateChecking = false;
  let updateInstalling = false;
  let updateProgress: DownloadProgress | null = null;
  let updateError = '';

  async function runUpdateCheck(silent = false) {
    updateChecking = true;
    if (!silent) updateError = '';
    try {
      updateCheck = await checkForUpdate();
    } catch (e: any) {
      if (!silent) updateError = e?.message ?? String(e);
    } finally {
      updateChecking = false;
    }
  }

  async function runInstall() {
    if (!updateCheck?.latest) return;
    updateInstalling = true;
    updateError = '';
    updateProgress = { received: 0, total: updateCheck.latest.apkSize };
    try {
      await downloadAndInstall(updateCheck.latest, (p) => (updateProgress = p));
    } catch (e: any) {
      updateError = e?.message ?? String(e);
    } finally {
      updateInstalling = false;
    }
  }

  function fmtMB(bytes: number): string {
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  // ─── AI 모델 설정 ─────────────────────────────────────────────
  let aiSettings: AiSettings | null = null;

  async function refreshAi() {
    aiSettings = await getAiSettings();
  }

  async function chooseModel(id: string) {
    aiSettings = await setAiSettings({ model: id });
  }

  async function chooseEffort(effort: ReasoningEffort) {
    aiSettings = await setAiSettings({ reasoningEffort: effort });
  }

  const EFFORT_LABELS: { id: ReasoningEffort; label: string; hint: string }[] = [
    { id: 'low',    label: '낮음', hint: '빠르고 저렴' },
    { id: 'medium', label: '중간', hint: '균형' },
    { id: 'high',   label: '높음', hint: '깊게 생각 · 느림' },
  ];

  // ─── 휴지통 ───────────────────────────────────────────────────
  let trash: TrashEntry[] = [];
  let trashBusy = false;

  async function refreshTrash() {
    const fs = await getFs();
    const db = await getDb();
    trash = await createDomains(fs, db).listTrash();
  }

  async function restoreTrashItem(folder: string) {
    trashBusy = true;
    try {
      const fs = await getFs();
      const db = await getDb();
      await createDomains(fs, db).restoreFromTrash(folder);
      await refreshTrash();
      await refreshDomains();
    } finally {
      trashBusy = false;
    }
  }

  async function purgeTrashItem(folder: string) {
    if (!confirm('영구적으로 삭제할까요? 되돌릴 수 없습니다.')) return;
    trashBusy = true;
    try {
      const fs = await getFs();
      const db = await getDb();
      await createDomains(fs, db).purgeTrash(folder);
      await refreshTrash();
    } finally {
      trashBusy = false;
    }
  }

  async function emptyTrash() {
    if (!confirm('휴지통을 완전히 비울까요? 되돌릴 수 없습니다.')) return;
    trashBusy = true;
    try {
      const fs = await getFs();
      const db = await getDb();
      await createDomains(fs, db).purgeTrash();
      await refreshTrash();
    } finally {
      trashBusy = false;
    }
  }

  function fmtDate(ts: number): string {
    return new Date(ts).toLocaleString('ko-KR');
  }

  onMount(() => {
    refresh();
    refreshAi();
    refreshTrash();
    // 앱 실행 시 조용히 업데이트 확인 (에러는 삼킴)
    if (isAndroid) runUpdateCheck(true);
  });

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

  <!-- ─── AI 모델 ─────────────────────────────────────────────────────── -->
  {#if aiSettings}
    {@const isGateway = mode?.mode === 'gateway'}
    {@const canReason = supportsReasoning(aiSettings.model)}
    <!-- ChatGPT 계정 로그인은 Codex backend 가 받아주는 모델만 고를 수 있다 -->
    {@const models = mode?.mode === 'oauth'
      ? MODEL_OPTIONS.filter(m => m.auth === 'oauth')
      : MODEL_OPTIONS}
    <section class="bg-toss-surface rounded-toss-card p-5 space-y-4">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-toss-chip bg-toss-blue-light flex items-center justify-center">
          <span class="msym text-toss-blue" style="font-size: 22px;">tune</span>
        </div>
        <div class="flex-1 min-w-0">
          <h2 class="font-bold text-[16px] text-toss-text-strong tracking-tight">AI 모델</h2>
          <p class="text-[13px] text-toss-text-weak font-medium truncate mt-0.5">
            {#if isGateway}
              게이트웨이 사용 중 — 서버 설정 모델 고정
            {:else}
              현재: {aiSettings.model}{canReason ? ` · 추론 ${aiSettings.reasoningEffort}` : ''}
            {/if}
          </p>
        </div>
      </div>

      {#if !isGateway}
        <div class="space-y-2">
          <p class="text-[12px] text-toss-text-weak font-semibold px-1">모델</p>
          <div class="space-y-1.5">
            {#each models as opt}
              <button
                on:click={() => chooseModel(opt.id)}
                class="md-ripple w-full flex items-center justify-between gap-3 px-4 h-[54px]
                       rounded-toss-btn text-left transition
                       {aiSettings.model === opt.id
                         ? 'bg-toss-blue-light ring-2 ring-toss-blue'
                         : 'bg-toss-bg-soft hover:bg-toss-line'}"
              >
                <div class="min-w-0">
                  <div class="font-bold text-[15px] text-toss-text-strong">{opt.label}</div>
                  {#if opt.note}
                    <div class="text-[11px] text-toss-text-weak font-medium truncate">{opt.note}</div>
                  {/if}
                </div>
                {#if aiSettings.model === opt.id}
                  <span class="msym text-toss-blue" style="font-size: 22px;">check_circle</span>
                {/if}
              </button>
            {/each}
          </div>
        </div>

        {#if canReason}
          <div class="space-y-2 pt-1">
            <p class="text-[12px] text-toss-text-weak font-semibold px-1">추론 강도 (Reasoning)</p>
            <div class="flex gap-2 bg-toss-bg-soft rounded-toss-btn p-1">
              {#each EFFORT_LABELS as e}
                <button
                  on:click={() => chooseEffort(e.id)}
                  class="flex-1 h-11 rounded-toss-btn font-bold text-[13px] transition
                         {aiSettings.reasoningEffort === e.id
                           ? 'bg-toss-surface text-toss-blue shadow-sm'
                           : 'text-toss-text-weak'}"
                >
                  {e.label}
                </button>
              {/each}
            </div>
            <p class="text-[11px] text-toss-text-weak font-medium leading-snug px-1">
              {EFFORT_LABELS.find(e => e.id === aiSettings?.reasoningEffort)?.hint ?? ''}
            </p>
          </div>
        {:else}
          <p class="text-[11px] text-toss-text-weak font-medium leading-snug">
            선택한 모델은 추론(Reasoning)을 지원하지 않아 강도 설정이 무시됩니다.
          </p>
        {/if}
      {/if}
    </section>
  {/if}

  <!-- ─── 앱 업데이트 ────────────────────────────────────────────────────── -->
  <section class="bg-toss-surface rounded-toss-card p-5 space-y-4">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-toss-chip bg-toss-blue-light flex items-center justify-center">
        <span class="msym text-toss-blue" style="font-size: 22px;">system_update</span>
      </div>
      <div class="flex-1 min-w-0">
        <h2 class="font-bold text-[16px] text-toss-text-strong tracking-tight">앱 업데이트</h2>
        <p class="text-[13px] text-toss-text-weak font-medium truncate mt-0.5">
          현재 버전 v{APP_VERSION}
          {#if updateCheck?.latest}
            · 최신 v{updateCheck.latest.version}
          {/if}
        </p>
      </div>
    </div>

    {#if !updateCheck?.configured && updateCheck !== null}
      <div class="bg-toss-bg-soft rounded-toss-btn p-3 text-[12px] text-toss-text-weak font-medium leading-snug">
        업데이트 서버가 설정되지 않았습니다. <code>.env</code> 에
        <code>VITE_UPDATE_REPO=owner/repo</code> 를 추가하고 재빌드하세요.
      </div>
    {:else if updateCheck?.hasUpdate}
      <div class="bg-toss-blue-light rounded-toss-btn p-3 space-y-2">
        <p class="text-[14px] text-toss-text-strong font-bold">
          새 버전 v{updateCheck.latest!.version} 이 있습니다
        </p>
        {#if updateCheck.latest!.notes}
          <p class="text-[12px] text-toss-text font-medium whitespace-pre-wrap leading-snug">
            {updateCheck.latest!.notes}
          </p>
        {/if}
      </div>
      {#if updateInstalling && updateProgress}
        <div class="bg-toss-bg-soft rounded-toss-btn p-3 space-y-2">
          <div class="flex justify-between text-[12px] text-toss-text-weak font-semibold">
            <span>다운로드 중...</span>
            <span>
              {fmtMB(updateProgress.received)}
              {#if updateProgress.total}/ {fmtMB(updateProgress.total)}{/if}
            </span>
          </div>
          {#if updateProgress.total > 0}
            <div class="h-1.5 bg-toss-line rounded-full overflow-hidden">
              <div class="h-full bg-toss-blue transition-all"
                   style="width: {(updateProgress.received / updateProgress.total * 100).toFixed(1)}%"></div>
            </div>
          {/if}
        </div>
      {:else}
        <button
          on:click={runInstall}
          disabled={updateInstalling}
          class="md-ripple w-full bg-toss-blue text-white rounded-toss-btn h-[54px]
                 font-bold text-[17px] hover:bg-toss-blue-hover
                 disabled:bg-toss-bg-soft disabled:text-toss-text-disabled"
        >
          지금 업데이트 ({fmtMB(updateCheck.latest!.apkSize)})
        </button>
      {/if}
    {:else}
      <button
        on:click={() => runUpdateCheck(false)}
        disabled={updateChecking}
        class="md-ripple w-full bg-toss-bg-soft text-toss-text-strong rounded-toss-btn h-[54px]
               font-bold text-[15px] disabled:opacity-50"
      >
        {updateChecking ? '확인 중...' : (updateCheck ? '최신 버전입니다' : '업데이트 확인')}
      </button>
    {/if}

    {#if updateError}
      <div class="text-toss-error text-[13px] font-medium">{updateError}</div>
    {/if}
  </section>

  <!-- ─── 휴지통 ─────────────────────────────────────────────────────── -->
  <section class="bg-toss-surface rounded-toss-card p-5 space-y-4">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-toss-chip bg-toss-blue-light flex items-center justify-center">
        <span class="msym text-toss-blue" style="font-size: 22px;">delete</span>
      </div>
      <div class="flex-1 min-w-0">
        <h2 class="font-bold text-[16px] text-toss-text-strong tracking-tight">휴지통</h2>
        <p class="text-[13px] text-toss-text-weak font-medium truncate mt-0.5">
          삭제한 화면 {trash.length}개
        </p>
      </div>
      {#if trash.length > 0}
        <button
          on:click={emptyTrash}
          disabled={trashBusy}
          class="md-ripple bg-toss-bg-soft text-toss-error rounded-toss-btn h-9 px-3 font-bold text-[12px] disabled:opacity-50"
        >
          비우기
        </button>
      {/if}
    </div>

    {#if trash.length === 0}
      <p class="text-[13px] text-toss-text-weak font-medium">휴지통이 비어 있습니다.</p>
    {:else}
      <div class="space-y-2">
        {#each trash as item (item.folder)}
          <div class="bg-toss-bg-soft rounded-toss-btn p-3 flex items-center gap-3">
            {#if item.icon}
              <span class="text-[20px]">{item.icon}</span>
            {:else}
              <span class="msym text-toss-text-weak" style="font-size: 20px;">widgets</span>
            {/if}
            <div class="flex-1 min-w-0">
              <div class="font-bold text-[14px] text-toss-text-strong truncate">{item.displayName}</div>
              <div class="text-[11px] text-toss-text-weak font-medium truncate">
                {item.name} · {fmtDate(item.deletedAt)} 삭제
              </div>
            </div>
            <button
              on:click={() => restoreTrashItem(item.folder)}
              disabled={trashBusy}
              class="md-ripple bg-toss-blue-light text-toss-blue rounded-toss-btn h-9 px-3 font-bold text-[12px] disabled:opacity-50"
            >
              복원
            </button>
            <button
              on:click={() => purgeTrashItem(item.folder)}
              disabled={trashBusy}
              class="md-ripple bg-toss-surface text-toss-error rounded-toss-btn h-9 px-3 font-bold text-[12px] disabled:opacity-50"
            >
              영구삭제
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </section>
</div>
