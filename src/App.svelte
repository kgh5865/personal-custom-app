<script lang="ts">
  import Router, { link, router } from 'svelte-spa-router';
  import Home from './routes/Home.svelte';
  import Chat from './routes/Chat.svelte';
  import Profile from './routes/Profile.svelte';
  import Settings from './routes/Settings.svelte';
  import Domain from './routes/Domain.svelte';

  const routes = {
    '/': Home,
    '/chat': Chat,
    '/profile': Profile,
    '/settings': Settings,
    '/domain/:name': Domain,
  };

  const tabs = [
    { href: '/',         label: '홈',    icon: 'home',     match: (l: string) => l === '/' },
    { href: '/chat',     label: '챗',    icon: 'chat_bubble',     match: (l: string) => l.startsWith('/chat') },
    { href: '/profile',  label: '프로필', icon: 'person',   match: (l: string) => l.startsWith('/profile') },
    { href: '/settings', label: '설정',  icon: 'settings', match: (l: string) => l.startsWith('/settings') },
  ];
</script>

<div class="flex flex-col min-h-screen bg-toss-bg">
  <main class="flex-1" style="padding-bottom: {router.location.startsWith('/domain/') ? '0' : '76px'};">
    <Router {routes} />
  </main>

  {#if !router.location.startsWith('/domain/')}
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
</div>
