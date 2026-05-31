import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFs, type FsBackend } from '../src/lib/fs';

function makeBackend(): FsBackend & {
  files: Map<string, string>;
  dirs: Set<string>;
  spies: { readFile: any; writeFile: any; mkdir: any; readdir: any; exists: any; copyFile: any; remove: any };
} {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  const readFile = vi.fn(async (p: string) => {
    const v = files.get(p);
    if (v == null) throw new Error('ENOENT');
    return v;
  });
  const writeFile = vi.fn(async (p: string, d: string) => { files.set(p, d); });
  const mkdir = vi.fn(async (p: string) => { dirs.add(p); });
  const readdir = vi.fn(async (p: string) => {
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
  });
  const exists = vi.fn(async (p: string) => files.has(p) || dirs.has(p));
  const copyFile = vi.fn(async (s: string, d: string) => {
    const v = files.get(s);
    if (v == null) throw new Error('ENOENT');
    files.set(d, v);
  });
  const remove = vi.fn(async (p: string) => {
    files.delete(p);
    dirs.delete(p);
    for (const k of [...files.keys()]) if (k.startsWith(p + '/')) files.delete(k);
    for (const k of [...dirs]) if (k.startsWith(p + '/')) dirs.delete(k);
  });
  return {
    files, dirs,
    spies: { readFile, writeFile, mkdir, readdir, exists, copyFile, remove },
    readFile, writeFile, mkdir, readdir, exists, copyFile, remove,
  };
}

describe('fs', () => {
  let backend: ReturnType<typeof makeBackend>;
  let fs: ReturnType<typeof createFs>;
  beforeEach(() => {
    backend = makeBackend();
    fs = createFs(backend);
  });

  it('write creates intermediate directory via backend.mkdir then writes', async () => {
    await fs.write('/a/b.txt', 'hello');
    expect(backend.spies.mkdir).toHaveBeenCalledWith('/a');
    expect(backend.spies.writeFile).toHaveBeenCalledWith('/a/b.txt', 'hello');
  });

  it('write swallows mkdir errors (idempotent for existing dirs)', async () => {
    backend.spies.mkdir.mockRejectedValueOnce(new Error('EEXIST'));
    await expect(fs.write('/exists/file.txt', 'x')).resolves.toBeUndefined();
    expect(backend.spies.writeFile).toHaveBeenCalledWith('/exists/file.txt', 'x');
  });

  it('read delegates to backend.readFile', async () => {
    await fs.write('/x.txt', 'y');
    expect(await fs.read('/x.txt')).toBe('y');
    expect(backend.spies.readFile).toHaveBeenCalledWith('/x.txt');
  });

  it('exists returns true after write, false for missing', async () => {
    await fs.write('/x.txt', 'y');
    expect(await fs.exists('/x.txt')).toBe(true);
    expect(await fs.exists('/missing.txt')).toBe(false);
  });

  it('list returns immediate children only', async () => {
    await fs.write('/dir/a.txt', '1');
    await fs.write('/dir/b.txt', '2');
    await fs.write('/dir/sub/c.txt', '3');
    const items = await fs.list('/dir');
    expect(items.sort()).toEqual(['a.txt', 'b.txt', 'sub']);
  });

  it('copy delegates to backend.copyFile', async () => {
    await fs.write('/a.txt', 'data');
    await fs.copy('/a.txt', '/b.txt');
    expect(backend.spies.copyFile).toHaveBeenCalledWith('/a.txt', '/b.txt');
    expect(await fs.read('/b.txt')).toBe('data');
  });

  it('remove deletes file or directory tree', async () => {
    await fs.write('/d/x.txt', 'x');
    await fs.write('/d/sub/y.txt', 'y');
    await fs.remove('/d');
    expect(backend.spies.remove).toHaveBeenCalledWith('/d');
    expect(await fs.exists('/d/x.txt')).toBe(false);
  });
});
