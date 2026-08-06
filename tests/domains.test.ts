import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDomains, type Domains } from '../src/lib/domains';
import { createFs, type FsBackend } from '../src/lib/fs';
import { createDb, type Db, type DbBackend } from '../src/lib/db';

// domain_meta 테이블만 흉내내는 인메모리 fake. domains.ts 가 실제로 던지는 SQL 문 3종류만 이해하면 된다.
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
    async readFile(p) {
      const v = files.get(p);
      if (v == null) throw new Error('ENOENT');
      return v;
    },
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
      // 실제 Capacitor Filesystem.copy 는 대상 디렉터리를 만들어주지 않는다.
      // 여기서 관대하게 굴면 기기에서만 터지는 버그를 테스트가 놓친다
      // (실제로 restoreFromTrash 가 이 때문에 통과했다).
      const parent = d.substring(0, d.lastIndexOf('/'));
      if (parent && !dirs.has(parent)) {
        throw new Error(`ENOENT: 대상 디렉터리가 없습니다: ${parent}`);
      }
      files.set(d, v);
    },
    async remove(p) {
      files.delete(p);
      dirs.delete(p);
      for (const k of [...files.keys()]) if (k.startsWith(p + '/')) files.delete(k);
      for (const k of [...dirs]) if (k.startsWith(p + '/')) dirs.delete(k);
    },
  };
}

describe('domains', () => {
  let fs: ReturnType<typeof createFs>;
  let db: Db;
  let domains: Domains;
  beforeEach(() => {
    fs = createFs(memFsBackend());
    db = createDb(memDbBackend());
    domains = createDomains(fs, db);
  });

  it('create writes meta + default index.html/style.css/script.js', async () => {
    await domains.create('memo', '메모');
    expect(await fs.exists('/domains/memo/meta.json')).toBe(true);
    expect(await fs.exists('/domains/memo/index.html')).toBe(true);
    expect(await fs.exists('/domains/memo/style.css')).toBe(true);
    expect(await fs.exists('/domains/memo/script.js')).toBe(true);
    const meta = JSON.parse(await fs.read('/domains/memo/meta.json'));
    expect(meta.name).toBe('memo');
    expect(meta.displayName).toBe('메모');
    expect(typeof meta.createdAt).toBe('number');
  });

  it('create accepts optional icon', async () => {
    await domains.create('memo', '메모', '📝');
    const meta = JSON.parse(await fs.read('/domains/memo/meta.json'));
    expect(meta.icon).toBe('📝');
  });

  it('list returns all created domains', async () => {
    await domains.create('memo', '메모');
    await domains.create('todo', '할일');
    const list = await domains.list();
    expect(list.map(d => d.name).sort()).toEqual(['memo', 'todo']);
    expect(list.find(d => d.name === 'memo')?.displayName).toBe('메모');
  });

  it('list returns empty array when no domains', async () => {
    const list = await domains.list();
    expect(list).toEqual([]);
  });

  it('read returns current html/css/js', async () => {
    await domains.create('memo', '메모');
    const files = await domains.read('memo');
    expect(typeof files.html).toBe('string');
    expect(files.html.length).toBeGreaterThan(0);
    expect(typeof files.css).toBe('string');
    expect(typeof files.js).toBe('string');
  });

  it('update replaces files and updates meta.updatedAt', async () => {
    await domains.create('memo', '메모');
    const metaBefore = JSON.parse(await fs.read('/domains/memo/meta.json'));
    await domains.update('memo', { html: '<p>updated</p>' });
    const files = await domains.read('memo');
    expect(files.html).toBe('<p>updated</p>');
    const metaAfter = JSON.parse(await fs.read('/domains/memo/meta.json'));
    expect(metaAfter.updatedAt).toBeGreaterThan(metaBefore.updatedAt);
  });

  it('update backs up previous version before writing', async () => {
    await domains.create('memo', '메모');
    await domains.update('memo', { html: '<p>v2</p>' });
    await domains.update('memo', { html: '<p>v3</p>' });
    const hist = await domains.history('memo');
    expect(hist.length).toBeGreaterThanOrEqual(2);
  });

  it('partial update only writes provided files (others unchanged)', async () => {
    await domains.create('memo', '메모');
    const before = await domains.read('memo');
    await domains.update('memo', { html: '<p>only html</p>' });
    const after = await domains.read('memo');
    expect(after.html).toBe('<p>only html</p>');
    expect(after.css).toBe(before.css);
    expect(after.js).toBe(before.js);
  });

  it('revert restores previous version', async () => {
    await domains.create('memo', '메모');
    const original = (await domains.read('memo')).html;
    await domains.update('memo', { html: '<p>changed</p>' });
    await domains.revert('memo', 1);
    expect((await domains.read('memo')).html).toBe(original);
  });

  it('revert throws when not enough history', async () => {
    await domains.create('memo', '메모');
    await expect(domains.revert('memo', 1)).rejects.toThrow(/history/i);
  });

  it('delete moves the domain to trash instead of removing it entirely', async () => {
    await domains.create('memo', '메모');
    await domains.delete('memo');
    expect((await domains.list()).length).toBe(0);
    expect(await fs.exists('/domains/memo/meta.json')).toBe(false);
    const trashNames = await fs.list('/domains/.trash');
    expect(trashNames.length).toBe(1);
    expect(trashNames[0].startsWith('memo-')).toBe(true);
    expect(await fs.exists(`/domains/.trash/${trashNames[0]}/meta.json`)).toBe(true);
  });

  it('.trash is not treated as a domain by list()', async () => {
    await domains.create('memo', '메모');
    await domains.delete('memo');
    await domains.create('todo', '할일');
    const list = await domains.list();
    expect(list.map(d => d.name)).toEqual(['todo']);
  });

  it('history returns timestamps in descending order (newest first)', async () => {
    await domains.create('memo', '메모');
    await domains.update('memo', { html: 'a' });
    await domains.update('memo', { html: 'b' });
    const h = await domains.history('memo');
    expect(h.length).toBeGreaterThanOrEqual(2);
    expect(h[0]).toBeGreaterThan(h[1]);
  });

  it('backup snapshot contains the pre-update content (not the post-update content)', async () => {
    await domains.create('memo', '메모');
    const original = (await domains.read('memo')).html;
    await domains.update('memo', { html: '<p>v2</p>' });
    // Read the most recent backup file directly from fs
    const hist = await domains.history('memo');
    const ts = hist[0];
    const backed = await fs.read(`/domains/memo/history/${ts}/index.html`);
    expect(backed).toBe(original);
  });

  it('HISTORY_LIMIT caps history at 20 entries', async () => {
    await domains.create('memo', '메모');
    for (let i = 0; i < 25; i++) {
      await domains.update('memo', { html: `<p>v${i}</p>` });
    }
    const hist = await domains.history('memo');
    expect(hist.length).toBeLessThanOrEqual(20);
  });

  it('read throws when domain does not exist', async () => {
    await expect(domains.read('nope')).rejects.toThrow(/domain not found/);
  });

  it('patch replaces a unique search string', async () => {
    await domains.create('memo', '메모');
    await domains.update('memo', { html: '<h1>hello</h1>' });
    await domains.patch('memo', 'html', 'hello', 'world');
    expect((await domains.read('memo')).html).toBe('<h1>world</h1>');
  });

  it('patch throws when search string is not found', async () => {
    await domains.create('memo', '메모');
    await expect(domains.patch('memo', 'html', 'nope-not-there', 'x')).rejects.toThrow(/찾지 못했습니다/);
  });

  it('patch throws when search string appears more than once', async () => {
    await domains.create('memo', '메모');
    await domains.update('memo', { html: 'dup dup' });
    await expect(domains.patch('memo', 'html', 'dup', 'x')).rejects.toThrow(/모호/);
  });

  it('patch backs up the previous version before writing', async () => {
    await domains.create('memo', '메모');
    await domains.update('memo', { html: '<h1>hello</h1>' });
    await domains.patch('memo', 'html', 'hello', 'world');
    const hist = await domains.history('memo');
    const backed = await fs.read(`/domains/memo/history/${hist[0]}/index.html`);
    expect(backed).toBe('<h1>hello</h1>');
  });

  it('list self-heals from meta.json when the domain_meta table is empty', async () => {
    await domains.create('memo', '메모');
    // 테이블이 유실된 상황을 흉내낸다 (파일은 그대로, DB 만 비움)
    const emptyDb = createDb(memDbBackend());
    const healed = createDomains(fs, emptyDb);
    const list = await healed.list();
    expect(list.map(d => d.name)).toEqual(['memo']);
    // 재구축 후에는 다시 조회해도 테이블에서 바로 읽힌다
    const list2 = await healed.list();
    expect(list2.map(d => d.name)).toEqual(['memo']);
  });

  it('listTrash finds a deleted domain, restoreFromTrash brings it back to list()', async () => {
    await domains.create('memo', '메모', '📝');
    await domains.delete('memo');
    const trash = await domains.listTrash();
    expect(trash.length).toBe(1);
    expect(trash[0].name).toBe('memo');
    expect(trash[0].displayName).toBe('메모');
    expect(trash[0].icon).toBe('📝');

    await domains.restoreFromTrash(trash[0].folder);
    const list = await domains.list();
    expect(list.map(d => d.name)).toEqual(['memo']);
    expect(await fs.exists(`/domains/.trash/${trash[0].folder}`)).toBe(false);
  });

  it('restoreFromTrash renames to <name>-restored on name collision instead of overwriting', async () => {
    await domains.create('memo', '메모 원본');
    await domains.delete('memo');
    await domains.create('memo', '메모 새것'); // 같은 이름으로 재생성
    const trash = await domains.listTrash();

    await domains.restoreFromTrash(trash[0].folder);

    const list = await domains.list();
    expect(list.map(d => d.name).sort()).toEqual(['memo', 'memo-restored']);
    // 기존 것은 그대로
    expect((await domains.read('memo')).html).not.toBe(undefined);
    const restoredMeta = JSON.parse(await fs.read('/domains/memo-restored/meta.json'));
    expect(restoredMeta.name).toBe('memo-restored');
    expect(restoredMeta.displayName).toBe('메모 원본');
    const existingMeta = JSON.parse(await fs.read('/domains/memo/meta.json'));
    expect(existingMeta.displayName).toBe('메모 새것');
  });

  it('restoreFromTrash brings back history snapshots', async () => {
    await domains.create('memo', '메모');
    await domains.update('memo', { html: '<p>v2</p>' });
    await domains.delete('memo');
    const trash = await domains.listTrash();
    await domains.restoreFromTrash(trash[0].folder);
    const hist = await domains.history('memo');
    expect(hist.length).toBeGreaterThanOrEqual(1);
  });

  it('purgeTrash(folder) removes only that entry; purgeTrash() with no args empties trash', async () => {
    await domains.create('memo', '메모');
    await domains.delete('memo');
    await domains.create('todo', '할일');
    await domains.delete('todo');
    let trash = await domains.listTrash();
    expect(trash.length).toBe(2);

    const memoFolder = trash.find(t => t.name === 'memo')!.folder;
    await domains.purgeTrash(memoFolder);
    trash = await domains.listTrash();
    expect(trash.map(t => t.name)).toEqual(['todo']);

    await domains.purgeTrash();
    trash = await domains.listTrash();
    expect(trash.length).toBe(0);
  });
});
