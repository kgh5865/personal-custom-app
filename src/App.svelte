<script lang="ts">
  import { onMount } from 'svelte';
  import Router, { link, replace, router } from 'svelte-spa-router';
  import Home from './routes/Home.svelte';
  import Chat from './routes/Chat.svelte';
  import Profile from './routes/Profile.svelte';
  import Settings from './routes/Settings.svelte';
  import Domain from './routes/Domain.svelte';
  import Onboarding from './routes/Onboarding.svelte';
  import { isOnboardingDone } from './lib/onboarding';
  import { getAuthMode } from './lib/oauth';

  const routes = {
    '/': Home,
    '/chat': Chat,
    '/profile': Profile,
    '/settings': Settings,
    '/domain/:name': Domain,
    '/onboarding': Onboarding,
  };

  // 판정 끝나기 전까지 홈이 번쩍이지 않도록 렌더를 미룬다.
  let ready = false;

  onMount(async () => {
    try {
      const [done, authMode] = await Promise.all([isOnboardingDone(), getAuthMode()]);
      // 이미 로그인돼 있으면 온보딩을 띄우지 않는다 (기존 사용자를 괴롭히지 않기 위함).
      if (!done && authMode === null) {
        replace('/onboarding');
      }
    } catch (e) {
      // 시크릿 저장소가 열리지 않는 등으로 판정에 실패해도 앱은 떠야 한다.
      // 여기서 ready 를 못 세우면 화면이 통째로 빈 채로 남는다.
      console.error('onboarding check failed', e);
    } finally {
      ready = true;
    }
  });

  const tabs = [
    { href: '/',         label: '홈',    icon: 'home',     match: (l: string) => l === '/' },
    { href: '/chat',     label: '챗',    icon: 'chat_bubble',     match: (l: string) => l.startsWith('/chat') },
    { href: '/profile',  label: '프로필', icon: 'person',   match: (l: string) => l.startsWith('/profile') },
    { href: '/settings', label: '설정',  icon: 'settings', match: (l: string) => l.startsWith('/settings') },
  ];
</script>

<div class="flex flex-col min-h-screen bg-toss-bg">
  {#if ready}
  <main class="flex-1" style="padding-bottom: {router.location.startsWith('/domain/') || router.location === '/onboarding' ? '0' : '76px'};">
    <Router {routes} />
  </main>

  {#if !router.location.startsWith('/domain/') && router.location !== '/onboarding'}
    <nav
      class="fixed bottom-0 left-0 right-0 bg-toss-surface z-50 border-t border-toss-line"
      style="padding-bottom: env(safe-area-inset-bottom);"
    >
      <ul class="flex justify-around items-center h-[60px] px-2">
        {#each tabs as t}
          {@const active = t.match(router.location)}
          <li class="flex-1">
            <a
              use:link
              href={t.href}
              class="md-ripple flex flex-col items-center justify-center gap-1 py-1.5
                     {active ? 'text-toss-blue' : 'text-toss-text-weak'}"
            >
              <span class="msym {active ? 'fill' : ''}" style="font-size: 24px;">{t.icon}</span>
              <span class="text-[11px] font-semibold tracking-tight">{t.label}</span>
            </a>
          </li>
        {/each}
      </ul>
    </nav>
  {/if}
  {/if}
</div>
