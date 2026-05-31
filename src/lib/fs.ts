export interface FsBackend {
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  readdir(path: string): Promise<string[]>;
  exists(path: string): Promise<boolean>;
  copyFile(src: string, dst: string): Promise<void>;
  remove(path: string): Promise<void>;
}

export function createFs(backend: FsBackend) {
  return {
    read: backend.readFile.bind(backend),
    async write(path: string, data: string): Promise<void> {
      const dir = path.substring(0, path.lastIndexOf('/'));
      if (dir) {
        try { await backend.mkdir(dir); } catch { /* idempotent: dir may exist */ }
      }
      await backend.writeFile(path, data);
    },
    list: backend.readdir.bind(backend),
    exists: backend.exists.bind(backend),
    copy: backend.copyFile.bind(backend),
    remove: backend.remove.bind(backend),
    mkdir: backend.mkdir.bind(backend),
  };
}

export type Fs = ReturnType<typeof createFs>;

// Production singleton with promise-caching
let initPromise: Promise<Fs> | null = null;
export function getFs(): Promise<Fs> {
  if (!initPromise) initPromise = initProd();
  return initPromise;
}

async function initProd(): Promise<Fs> {
  try {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const backend: FsBackend = {
      async readFile(path) {
        const r = await Filesystem.readFile({ path, directory: Directory.Data, encoding: Encoding.UTF8 });
        return r.data as string;
      },
      async writeFile(path, data) {
        await Filesystem.writeFile({ path, data, directory: Directory.Data, encoding: Encoding.UTF8, recursive: true });
      },
      async mkdir(path) {
        try { await Filesystem.mkdir({ path, directory: Directory.Data, recursive: true }); } catch {}
      },
      async readdir(path) {
        const r = await Filesystem.readdir({ path, directory: Directory.Data });
        return r.files.map((f: any) => f.name ?? f);
      },
      async exists(path) {
        try { await Filesystem.stat({ path, directory: Directory.Data }); return true; }
        catch { return false; }
      },
      async copyFile(src, dst) {
        await Filesystem.copy({ from: src, to: dst, directory: Directory.Data, toDirectory: Directory.Data });
      },
      async remove(path) {
        try { await Filesystem.deleteFile({ path, directory: Directory.Data }); }
        catch { try { await Filesystem.rmdir({ path, directory: Directory.Data, recursive: true }); } catch {} }
      },
    };
    return createFs(backend);
  } catch (e) {
    initPromise = null;
    throw e;
  }
}
