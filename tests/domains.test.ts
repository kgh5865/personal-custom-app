import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDomains, type Domains } from '../src/lib/domains';
import { createFs, type FsBackend } from '../src/lib/fs';

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
  let domains: Domains;
  beforeEach(() => {
    fs = createFs(memFsBackend());
    domains = createDomains(fs);
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
    await new Promise(r => setTimeout(r, 5));
    await domains.update('memo', { html: '<p>updated</p>' });
    const files = await domains.read('memo');
    expect(files.html).toBe('<p>updated</p>');
    const metaAfter = JSON.parse(await fs.read('/domains/memo/meta.json'));
    expect(metaAfter.updatedAt).toBeGreaterThan(metaBefore.updatedAt);
  });

  it('update backs up previous version before writing', async () => {
    await domains.create('memo', '메모');
    await domains.update('memo', { html: '<p>v2</p>' });
    await new Promise(r => setTimeout(r, 5));
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

  it('delete removes the domain entirely', async () => {
    await domains.create('memo', '메모');
    await domains.delete('memo');
    expect((await domains.list()).length).toBe(0);
    expect(await fs.exists('/domains/memo/meta.json')).toBe(false);
  });

  it('history returns timestamps in descending order (newest first)', async () => {
    await domains.create('memo', '메모');
    await domains.update('memo', { html: 'a' });
    await new Promise(r => setTimeout(r, 5));
    await domains.update('memo', { html: 'b' });
    const h = await domains.history('memo');
    expect(h.length).toBeGreaterThanOrEqual(2);
    expect(h[0]).toBeGreaterThan(h[1]);
  });
});
