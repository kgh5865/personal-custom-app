<script lang="ts">
  import { onMount } from 'svelte';
  import { link, replace } from 'svelte-spa-router';
  import { getAuthMode, type AuthMode } from '../lib/oauth';
  import { profile, loadProfile } from '../stores/profile';
  import { markOnboardingDone } from '../lib/onboarding';

  let authMode: AuthMode | null = null;

  $: profileDone = Object.values($profile).some((v) => v !== undefined && v !== '');
  $: authDone = authMode !== null;

  async function refresh() {
    authMode = await getAuthMode();
    await loadProfile();
  }

  onMount(refresh);

  async function onStart() {
    await markOnboardingDone();
    replace('/');
  }
</script>

<div class="px-5 pt-4 pb-8 space-y-6">
  <header class="pt-3 pb-1">
    <h1 class="text-[26px] font-extrabold text-toss-text-strong tracking-tight leading-tight">
      환영합니다
    </h1>
    <p class="text-[15px] text-toss-text mt-1 font-medium leading-relaxed">
      이 앱은 빈 그릇이에요. 챗에서 GPT에게 원하는 화면을 만들어달라고<br/>
      말하면 그 화면이 홈에 추가됩니다. 시작 전에 아래 두 가지를 준비해두면 좋아요.
    </p>
  </header>

  <section class="bg-toss-surface rounded-toss-card overflow-hidden">
    <div class="flex items-center gap-4 px-4 py-4 {authDone ? 'opacity-50' : ''}">
      <div class="w-11 h-11 rounded-toss-chip {authDone ? 'bg-toss-bg-soft' : 'bg-toss-blue-light'} flex items-center justify-center shrink-0">
        <span class="msym {authDone ? 'fill text-toss-text-weak' : 'text-toss-blue'}" style="font-size: 22px;">
          {authDone ? 'check' : 'smart_toy'}
        </span>
      </div>
      <div class="flex-1 min-w-0">
        <div class="font-bold text-[16px] text-toss-text-strong tracking-tight">AI 연동</div>
        <div class="text-[13px] text-toss-text-weak font-medium mt-0.5">
          {authDone ? '연결됐어요' : '챗을 쓰려면 설정에서 연결이 필요해요'}
        </div>
      </div>
      {#if !authDone}
        <a
          use:link
          href="/settings"
          class="md-ripple shrink-0 h-9 px-4 rounded-toss-btn bg-toss-blue text-white font-bold text-[13px] flex items-center"
        >
          설정으로
        </a>
      {/if}
    </div>

    <div class="flex items-center gap-4 px-4 py-4 border-t border-toss-line {profileDone ? 'opacity-50' : ''}">
      <div class="w-11 h-11 rounded-toss-chip {profileDone ? 'bg-toss-bg-soft' : 'bg-toss-blue-light'} flex items-center justify-center shrink-0">
        <span class="msym {profileDone ? 'fill text-toss-text-weak' : 'text-toss-blue'}" style="font-size: 22px;">
          {profileDone ? 'check' : 'person'}
        </span>
      </div>
      <div class="flex-1 min-w-0">
        <div class="font-bold text-[16px] text-toss-text-strong tracking-tight">프로필 입력</div>
        <div class="text-[13px] text-toss-text-weak font-medium mt-0.5">
          {profileDone ? '입력했어요' : 'GPT가 나에게 맞는 화면을 만드는 데 쓰여요'}
        </div>
      </div>
      {#if !profileDone}
        <a
          use:link
          href="/profile"
          class="md-ripple shrink-0 h-9 px-4 rounded-toss-btn bg-toss-blue text-white font-bold text-[13px] flex items-center"
        >
          프로필로
        </a>
      {/if}
    </div>
  </section>

  <button
    on:click={onStart}
    class="md-ripple w-full bg-toss-blue text-white rounded-toss-btn h-[54px] font-bold text-[17px]
           hover:bg-toss-blue-hover"
  >
    시작하기
  </button>
</div>
