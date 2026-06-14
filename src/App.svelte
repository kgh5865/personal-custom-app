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
    { href: '/chat',     label: '챗',    icon: 'chat',     match: (l: string) => l.startsWith('/chat') },
    { href: '/profile',  label: '프로필', icon: 'person',   match: (l: string) => l.startsWith('/profile') },
    { href: '/settings', label: '설정',  icon: 'settings', match: (l: string) => l.startsWith('/settings') },
  ];
</script>

<div class="flex flex-col min-h-screen bg-surface">
  <main class="flex-1" style="padding-bottom: {router.location.startsWith('/domain/') ? '0' : '80px'};">
    <Router {routes} />
  </main>

  {#if !router.location.startsWith('/domain/')}
    <nav
      class="fixed bottom-0 left-0 right-0 bg-surface-container z-50 border-t border-outline-variant"
      style="padding-bottom: env(safe-area-inset-bottom);"
    >
      <ul class="flex justify-around items-center h-20 px-2">
        {#each tabs as t}
          {@const active = t.match(router.location)}
          <li class="flex-1">
            <a
              use:link
              href={t.href}
              class="md-ripple flex flex-col items-center justify-center py-2 rounded-md-lg
                     {active ? 'text-on-secondary-container' : 'text-on-surface-variant'}"
            >
              <span
                class="msym {active ? 'fill' : ''} relative px-4 py-1 rounded-md-xl
                       {active ? 'bg-secondary-container' : ''}"
                style="transition: background-color 0.2s;"
              >
                {t.icon}
              </span>
              <span class="text-xs mt-1 font-medium">{t.label}</span>
            </a>
          </li>
        {/each}
      </ul>
    </nav>
  {/if}
</div>
