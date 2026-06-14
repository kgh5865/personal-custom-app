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

<div class="p-4 space-y-4 max-w-xl">
  <header class="pt-2">
    <h1 class="text-2xl font-medium text-on-surface">프로필</h1>
    <p class="text-sm text-on-surface-variant mt-1">개인 정보는 기기 안에만 저장됩니다.</p>
  </header>

  <div class="space-y-3">
    <label class="block">
      <span class="text-sm text-on-surface-variant px-1">출생연도</span>
      <input
        type="number"
        bind:value={form.birthYear}
        class="mt-1 w-full bg-surface-container-high border-0 rounded-md-sm px-3 py-2.5
               text-on-surface placeholder:text-on-surface-variant outline-none
               focus:ring-2 focus:ring-primary"
      />
    </label>

    <label class="block">
      <span class="text-sm text-on-surface-variant px-1">거주지</span>
      <input
        type="text"
        bind:value={form.region}
        placeholder="서울 강남구"
        class="mt-1 w-full bg-surface-container-high border-0 rounded-md-sm px-3 py-2.5
               text-on-surface placeholder:text-on-surface-variant outline-none
               focus:ring-2 focus:ring-primary"
      />
    </label>

    <label class="block">
      <span class="text-sm text-on-surface-variant px-1">직업</span>
      <input
        type="text"
        bind:value={form.job}
        class="mt-1 w-full bg-surface-container-high border-0 rounded-md-sm px-3 py-2.5
               text-on-surface placeholder:text-on-surface-variant outline-none
               focus:ring-2 focus:ring-primary"
      />
    </label>

    <label class="block">
      <span class="text-sm text-on-surface-variant px-1">연소득(만원)</span>
      <input
        type="number"
        bind:value={form.income}
        class="mt-1 w-full bg-surface-container-high border-0 rounded-md-sm px-3 py-2.5
               text-on-surface placeholder:text-on-surface-variant outline-none
               focus:ring-2 focus:ring-primary"
      />
    </label>

    <label class="flex items-center gap-3 py-2">
      <input
        type="checkbox"
        bind:checked={form.married}
        class="w-5 h-5 accent-primary"
      />
      <span class="text-on-surface">기혼</span>
    </label>

    <label class="block">
      <span class="text-sm text-on-surface-variant px-1">자녀 수</span>
      <input
        type="number"
        bind:value={form.children}
        class="mt-1 w-full bg-surface-container-high border-0 rounded-md-sm px-3 py-2.5
               text-on-surface outline-none focus:ring-2 focus:ring-primary"
      />
    </label>

    <label class="block">
      <span class="text-sm text-on-surface-variant px-1">메모</span>
      <textarea
        bind:value={form.notes}
        rows="3"
        class="mt-1 w-full bg-surface-container-high border-0 rounded-md-sm px-3 py-2.5
               text-on-surface outline-none focus:ring-2 focus:ring-primary resize-none"
      ></textarea>
    </label>
  </div>

  <div class="flex items-center gap-3 pt-2">
    <button
      on:click={onSave}
      class="md-ripple bg-primary text-on-primary rounded-md-xl px-6 py-2.5 font-medium shadow-md-1"
    >
      저장
    </button>
    {#if saved}
      <span class="flex items-center gap-1 text-primary text-sm">
        <span class="msym fill" style="font-size: 18px;">check_circle</span>
        저장됨
      </span>
    {/if}
  </div>
</div>
