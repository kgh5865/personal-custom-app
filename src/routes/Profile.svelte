<script lang="ts">
  import { onMount } from 'svelte';
  import { profile, loadProfile, saveProfile, type UserProfile } from '../stores/profile';

  let form: UserProfile = {};
  let saved = false;

  onMount(async () => {
    await loadProfile();
    form = { ...$profile };
  });

  async function onSave() {
    await saveProfile(form);
    saved = true;
    setTimeout(() => (saved = false), 1500);
  }
</script>

<div class="px-5 pt-4 pb-8 space-y-6 max-w-xl">
  <header class="pt-3 pb-1">
    <h1 class="text-[26px] font-extrabold text-toss-text-strong tracking-tight leading-tight">
      프로필
    </h1>
    <p class="text-[15px] text-toss-text mt-1 font-medium">
      개인 정보는 기기 안에만 저장됩니다.
    </p>
  </header>

  <section class="bg-toss-surface rounded-toss-card p-5 space-y-4">
    <label class="block">
      <span class="block text-[13px] text-toss-text-weak font-semibold mb-1.5">출생연도</span>
      <input
        type="number"
        bind:value={form.birthYear}
        class="w-full bg-toss-bg-soft border-0 rounded-toss-btn px-4 h-12
               text-toss-text-strong placeholder:text-toss-text-weak outline-none
               font-semibold text-[15px] toss-num focus:bg-toss-blue-light focus:ring-2 focus:ring-toss-blue"
      />
    </label>

    <label class="block">
      <span class="block text-[13px] text-toss-text-weak font-semibold mb-1.5">거주지</span>
      <input
        type="text"
        bind:value={form.region}
        placeholder="서울 강남구"
        class="w-full bg-toss-bg-soft border-0 rounded-toss-btn px-4 h-12
               text-toss-text-strong placeholder:text-toss-text-weak outline-none
               font-semibold text-[15px] focus:bg-toss-blue-light focus:ring-2 focus:ring-toss-blue"
      />
    </label>

    <label class="block">
      <span class="block text-[13px] text-toss-text-weak font-semibold mb-1.5">직업</span>
      <input
        type="text"
        bind:value={form.job}
        class="w-full bg-toss-bg-soft border-0 rounded-toss-btn px-4 h-12
               text-toss-text-strong placeholder:text-toss-text-weak outline-none
               font-semibold text-[15px] focus:bg-toss-blue-light focus:ring-2 focus:ring-toss-blue"
      />
    </label>

    <label class="block">
      <span class="block text-[13px] text-toss-text-weak font-semibold mb-1.5">연소득(만원)</span>
      <input
        type="number"
        bind:value={form.income}
        class="w-full bg-toss-bg-soft border-0 rounded-toss-btn px-4 h-12
               text-toss-text-strong placeholder:text-toss-text-weak outline-none
               font-semibold text-[15px] toss-num focus:bg-toss-blue-light focus:ring-2 focus:ring-toss-blue"
      />
    </label>

    <label class="flex items-center justify-between gap-3 py-2 border-t border-toss-line pt-4">
      <span class="text-toss-text-strong font-bold text-[15px]">기혼</span>
      <input
        type="checkbox"
        bind:checked={form.married}
        class="w-5 h-5 accent-toss-blue"
      />
    </label>

    <label class="block">
      <span class="block text-[13px] text-toss-text-weak font-semibold mb-1.5">자녀 수</span>
      <input
        type="number"
        bind:value={form.children}
        class="w-full bg-toss-bg-soft border-0 rounded-toss-btn px-4 h-12
               text-toss-text-strong outline-none font-semibold text-[15px] toss-num
               focus:bg-toss-blue-light focus:ring-2 focus:ring-toss-blue"
      />
    </label>

    <label class="block">
      <span class="block text-[13px] text-toss-text-weak font-semibold mb-1.5">메모</span>
      <textarea
        bind:value={form.notes}
        rows="3"
        class="w-full bg-toss-bg-soft border-0 rounded-toss-btn px-4 py-3
               text-toss-text-strong outline-none font-medium text-[15px] resize-none
               focus:bg-toss-blue-light focus:ring-2 focus:ring-toss-blue"
      ></textarea>
    </label>
  </section>

  <div class="space-y-2">
    <button
      on:click={onSave}
      class="md-ripple w-full bg-toss-blue text-white rounded-toss-btn h-[54px] font-bold text-[17px]
             hover:bg-toss-blue-hover"
    >
      저장
    </button>
    {#if saved}
      <div class="flex items-center justify-center gap-1.5 text-toss-blue text-[14px] font-bold">
        <span class="msym fill" style="font-size: 18px;">check_circle</span>
        저장됐어요
      </div>
    {/if}
  </div>
</div>
