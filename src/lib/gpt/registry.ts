import type { Domains } from '../domains';
import type { UserProfile } from '../../stores/profile';
import type { ToolName } from './tools';

export interface RegistryDeps {
  domains: Domains;
  getProfile: () => Promise<UserProfile>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
}

export interface InvokeResult {
  ok: boolean;
  result?: any;
  error?: string;
}

export function createRegistry(deps: RegistryDeps) {
  const handlers: Record<ToolName, (args: any) => Promise<any>> = {
    create_domain: ({ name, displayName, icon }) => deps.domains.create(name, displayName, icon),
    list_domains: () => deps.domains.list(),
    read_screen: ({ domain }) => deps.domains.read(domain),
    update_screen: ({ domain, html, css, js }) => deps.domains.update(domain, { html, css, js }),
    patch_screen: ({ domain, file, search, replace }) => deps.domains.patch(domain, file, search, replace),
    revert_screen: ({ domain, steps }) => deps.domains.revert(domain, steps ?? 1),
    delete_domain: ({ domain }) => deps.domains.delete(domain),
    get_user_profile: () => deps.getProfile(),
    update_user_profile: async ({ updates }) => {
      await deps.updateProfile(updates);
      return await deps.getProfile();
    },
  };

  return {
    async invoke(name: ToolName | string, args: any): Promise<InvokeResult> {
      const fn = (handlers as Record<string, (args: any) => Promise<any>>)[name];
      if (!fn) return { ok: false, error: `unknown tool: ${name}` };
      try {
        const result = await fn(args ?? {});
        return { ok: true, result };
      } catch (e: any) {
        return { ok: false, error: e?.message ?? String(e) };
      }
    },
  };
}

export type Registry = ReturnType<typeof createRegistry>;
