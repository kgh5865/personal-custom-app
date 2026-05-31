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

<div class="p-4 space-y-3 max-w-md">
  <h1 class="text-xl font-bold">프로필</h1>

  <label class="block">출생연도
    <input type="number" bind:value={form.birthYear} class="border p-1 w-full rounded" />
  </label>
  <label class="block">거주지
    <input bind:value={form.region} class="border p-1 w-full rounded" placeholder="서울 강남구" />
  </label>
  <label class="block">직업
    <input bind:value={form.job} class="border p-1 w-full rounded" />
  </label>
  <label class="block">연소득(만원)
    <input type="number" bind:value={form.income} class="border p-1 w-full rounded" />
  </label>
  <label class="flex items-center gap-2">
    <input type="checkbox" bind:checked={form.married} /> 기혼
  </label>
  <label class="block">자녀 수
    <input type="number" bind:value={form.children} class="border p-1 w-full rounded" />
  </label>
  <label class="block">메모
    <textarea bind:value={form.notes} class="border p-1 w-full rounded h-20"></textarea>
  </label>

  <button on:click={onSave} class="bg-blue-600 text-white px-4 py-2 rounded">저장</button>
  {#if saved}<span class="text-green-600">저장됨</span>{/if}
</div>
