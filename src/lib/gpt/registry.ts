import type { Domains } from '../domains';
import type { UserProfile } from '../../stores/profile';
import { TOOL_DEFS, type ToolName } from './tools';

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

// 이름으로 바로 찾을 수 있게 tools.ts 의 스키마를 맵으로 변환 (단일 출처는 TOOL_DEFS)
const TOOL_DEF_BY_NAME = new Map(TOOL_DEFS.map(d => [d.name, d]));

// JSON Schema type -> typeof 결과 매핑. 'integer' 도 JS 상 number 이므로 number 로 취급.
function matchesType(value: any, type: string): boolean {
  switch (type) {
    case 'integer':
      return typeof value === 'number';
    case 'array':
      return Array.isArray(value);
    default:
      return typeof value === type;
  }
}

// tool_call 인자를 TOOL_DEFS 스키마 기준으로 검증한다. 문제를 전부 모아서 반환.
function validateArgs(name: string, args: any): string[] {
  const def = TOOL_DEF_BY_NAME.get(name as ToolName);
  if (!def) return [];
  const errors: string[] = [];
  const properties: Record<string, { type: string }> = (def.parameters as any).properties ?? {};
  const required: readonly string[] = (def.parameters as any).required ?? [];

  for (const key of required) {
    const value = args?.[key];
    if (value === undefined || value === null) {
      errors.push(`${name}: 필수 인자 '${key}' 가 없습니다`);
    }
  }

  for (const [key, schema] of Object.entries(properties)) {
    const value = args?.[key];
    if (value === undefined || value === null) continue; // 없는 필드는 required 검사에서 이미 처리
    if (!matchesType(value, schema.type)) {
      errors.push(`${name}: '${key}' 은 ${schema.type} 이어야 하는데 ${typeof value} 를 받았습니다`);
    }
  }

  return errors;
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
      const errors = validateArgs(name, args);
      if (errors.length > 0) return { ok: false, error: errors.join('; ') };
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
