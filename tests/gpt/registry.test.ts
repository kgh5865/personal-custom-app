import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRegistry, type RegistryDeps } from '../../src/lib/gpt/registry';
import { createFs, type FsBackend } from '../../src/lib/fs';
import { createDb, type DbBackend } from '../../src/lib/db';
import { createDomains } from '../../src/lib/domains';
import { TOOL_DEFS } from '../../src/lib/gpt/tools';
import type { UserProfile } from '../../src/stores/profile';

// domain_meta 테이블만 흉내내는 인메모리 fake (tests/domains.test.ts 와 동일한 패턴)
function memDbBackend(): DbBackend {
  const rows = new Map<string, any>();
  return {
    async execute(sql, params = []) {
      if (sql.includes('INSERT INTO domain_meta')) {
        const [name, display_name, icon, created_at, updated_at] = params;
        rows.set(name, { name, display_name, icon, created_at, updated_at });
      } else if (sql.includes('DELETE FROM domain_meta')) {
        rows.delete(params[0]);
      }
    },
    async query(sql) {
      if (sql.includes('domain_meta')) return { rows: [...rows.values()] };
      return { rows: [] };
    },
  };
}

function memFsBackend(): FsBackend {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  return {
    async readFile(p) { const v = files.get(p); if (v == null) throw new Error('ENOENT'); return v; },
    async writeFile(p, d) { files.set(p, d); },
    async mkdir(p) { dirs.add(p); },
    async readdir(p) {
      const prefix = p.endsWith('/') ? p : p + '/';
      const seen = new Set<string>();
      const out: string[] = [];
      for (const f of files.keys()) {
        if (f.startsWith(prefix)) {
          const first = f.slice(prefix.length).split('/')[0];
          if (first && !seen.has(first)) { seen.add(first); out.push(first); }
        }
      }
      for (const d of dirs) {
        if (d.startsWith(prefix)) {
          const first = d.slice(prefix.length).split('/')[0];
          if (first && !seen.has(first)) { seen.add(first); out.push(first); }
        }
      }
      return out;
    },
    async exists(p) { return files.has(p) || dirs.has(p); },
    async copyFile(s, d) {
      const v = files.get(s);
      if (v == null) throw new Error('ENOENT');
      files.set(d, v);
      const parent = d.substring(0, d.lastIndexOf('/'));
      if (parent) dirs.add(parent);
    },
    async remove(p) {
      files.delete(p); dirs.delete(p);
      for (const k of [...files.keys()]) if (k.startsWith(p + '/')) files.delete(k);
      for (const k of [...dirs]) if (k.startsWith(p + '/')) dirs.delete(k);
    },
  };
}

function makeDeps(): RegistryDeps & { _profile: UserProfile } {
  const fs = createFs(memFsBackend());
  const db = createDb(memDbBackend());
  const domains = createDomains(fs, db);
  const _profile: UserProfile = {};
  return {
    domains,
    _profile,
    getProfile: async () => _profile,
    updateProfile: async (updates) => { Object.assign(_profile, updates); },
  };
}

describe('tool registry', () => {
  let registry: ReturnType<typeof createRegistry>;
  let deps: ReturnType<typeof makeDeps>;
  beforeEach(() => {
    deps = makeDeps();
    registry = createRegistry(deps);
  });

  it('create_domain calls domains.create', async () => {
    const r = await registry.invoke('create_domain', { name: 'memo', displayName: '메모' });
    expect(r.ok).toBe(true);
    const list = await registry.invoke('list_domains', {});
    expect(list.ok).toBe(true);
    expect(Array.isArray(list.result)).toBe(true);
    expect(list.result.length).toBe(1);
    expect(list.result[0].name).toBe('memo');
    expect(list.result[0].displayName).toBe('메모');
  });

  it('create_domain accepts optional icon', async () => {
    const r = await registry.invoke('create_domain', { name: 'memo', displayName: '메모', icon: '📝' });
    expect(r.ok).toBe(true);
    expect(r.result.icon).toBe('📝');
  });

  it('update_screen + read_screen roundtrip', async () => {
    await registry.invoke('create_domain', { name: 'memo', displayName: '메모' });
    const u = await registry.invoke('update_screen', { domain: 'memo', html: '<p>hi</p>' });
    expect(u.ok).toBe(true);
    const r = await registry.invoke('read_screen', { domain: 'memo' });
    expect(r.ok).toBe(true);
    expect(r.result.html).toBe('<p>hi</p>');
  });

  it('revert_screen restores previous version', async () => {
    await registry.invoke('create_domain', { name: 'memo', displayName: '메모' });
    const before = (await registry.invoke('read_screen', { domain: 'memo' })).result.html;
    await registry.invoke('update_screen', { domain: 'memo', html: '<p>new</p>' });
    await registry.invoke('revert_screen', { domain: 'memo', steps: 1 });
    const after = (await registry.invoke('read_screen', { domain: 'memo' })).result.html;
    expect(after).toBe(before);
  });

  it('patch_screen + read_screen roundtrip', async () => {
    await registry.invoke('create_domain', { name: 'memo', displayName: '메모' });
    await registry.invoke('update_screen', { domain: 'memo', html: '<h1>hi</h1>' });
    const p = await registry.invoke('patch_screen', { domain: 'memo', file: 'html', search: 'hi', replace: 'bye' });
    expect(p.ok).toBe(true);
    const r = await registry.invoke('read_screen', { domain: 'memo' });
    expect(r.result.html).toBe('<h1>bye</h1>');
  });

  it('delete_domain removes the domain', async () => {
    await registry.invoke('create_domain', { name: 'memo', displayName: '메모' });
    const r = await registry.invoke('delete_domain', { domain: 'memo' });
    expect(r.ok).toBe(true);
    const list = await registry.invoke('list_domains', {});
    expect(list.result.length).toBe(0);
  });

  it('update_user_profile merges into existing profile', async () => {
    await registry.invoke('update_user_profile', { updates: { region: '서울' } });
    await registry.invoke('update_user_profile', { updates: { job: '개발자' } });
    const r = await registry.invoke('get_user_profile', {});
    expect(r.result.region).toBe('서울');
    expect(r.result.job).toBe('개발자');
  });

  it('returns ok:false for unknown tool', async () => {
    const r = await registry.invoke('nonexistent_tool' as any, {});
    expect(r.ok).toBe(false);
    expect(r.error).toContain('unknown tool');
  });

  it('returns ok:false with error message when handler throws', async () => {
    // read_screen on missing domain should throw → registry catches
    const r = await registry.invoke('read_screen', { domain: 'nope' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/domain not found/i);
  });

  it('handles missing args object (defaults to {})', async () => {
    const r = await registry.invoke('list_domains', undefined as any);
    expect(r.ok).toBe(true);
  });

  it('missing required arg → 실행되지 않고 필드 이름을 담은 에러를 돌려준다', async () => {
    const spy = vi.spyOn(deps.domains, 'patch');
    const r = await registry.invoke('patch_screen', { domain: 'memo', file: 'html', replace: 'x' });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('search');
    expect(spy).not.toHaveBeenCalled();
  });

  it('타입이 스키마와 다르면 실행되지 않고 ok:false 를 돌려준다', async () => {
    const spy = vi.spyOn(deps.domains, 'create');
    const r = await registry.invoke('create_domain', { name: 123, displayName: '메모' });
    expect(r.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('스키마에 없는 여분 필드는 허용하고 정상 실행된다', async () => {
    const r = await registry.invoke('create_domain', { name: 'memo', displayName: '메모', extra: 'whatever' });
    expect(r.ok).toBe(true);
  });

  it('여러 필드가 동시에 틀리면 메시지에 전부 포함한다', async () => {
    const r = await registry.invoke('patch_screen', { file: 123 });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('domain');
    expect(r.error).toContain('search');
    expect(r.error).toContain('replace');
    expect(r.error).toContain('file');
  });

  // TOOL_DEFS 에 정의된 모든 도구에 대해, required 인자를 빈 객체로 호출하면
  // (required 가 있는 경우) 반드시 검증에서 걸려 실행되지 않아야 한다
  it.each(TOOL_DEFS.filter(d => (d.parameters as any).required?.length > 0).map(d => d.name))(
    '%s: required 인자 없이 호출하면 검증에서 막힌다',
    async (name) => {
      const r = await registry.invoke(name, {});
      expect(r.ok).toBe(false);
      expect(r.error).toBeTruthy();
    }
  );
});
