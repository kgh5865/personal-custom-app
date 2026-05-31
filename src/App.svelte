<script lang="ts">
  import Router, { link } from 'svelte-spa-router';
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
</script>

<nav class="flex gap-3 p-3 border-b bg-gray-50">
  <a use:link href="/" class="text-blue-600">홈</a>
  <a use:link href="/chat" class="text-blue-600">챗</a>
  <a use:link href="/profile" class="text-blue-600">프로필</a>
  <a use:link href="/settings" class="text-blue-600">설정</a>
</nav>

<main>
  <Router {routes} />
</main>
