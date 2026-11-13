/**
 * Simulated, in-memory filesystem for the Hello Cat web terminal.
 *
 * The tree mirrors the shape of a Kali workstation (analyst home, /etc, /var/log,
 * /opt, /usr/bin, ...) so that operators can practise realistic reconnaissance
 * commands without ever touching the host that serves this application.
 */

const DEFAULT_MTIME = Date.UTC(2026, 10, 11, 9, 0, 0);

export const PERM = Object.freeze({
  READ: 0o400,
  WRITE: 0o200,
  EXEC: 0o100,
});

export const S_IRWXU = 0o700;
export const S_IRWXG = 0o070;
export const S_IRWXO = 0o007;

export function modeString(mode, kind = 'file') {
  const type = kind === 'dir' ? 'd' : kind === 'link' ? 'l' : '-';
  const bits = (shift, char) => (mode & shift ? char : '-');
  return [
    type,
    bits(S_IRWXU, 'r'),
    bits(0o400, 'w'),
    bits(0o100, 'x'),
    bits(S_IRWXG, 'r'),
    bits(0o020, 'w'),
    bits(0o010, 'x'),
    bits(S_IRWXO, 'r'),
    bits(0o002, 'w'),
    bits(0o001, 'x'),
  ].join('');
}

export function octal(mode) {
  return (mode & 0o7777).toString(8).padStart(3, '0');
}

export class FsError extends Error {
  constructor(message, code = 'ENOENT') {
    super(message);
    this.name = 'FsError';
    this.code = code;
  }
}

let nodeCounter = 0;

export class FsNode {
  constructor({ name, path, parent = null, type = 'file', mode = 0o644, owner = 'analyst', group = 'analysts', uid = 1000, gid = 1000, content = '', target = null, mtime = DEFAULT_MTIME }) {
    this.id = ++nodeCounter;
    this.name = name;
    this.path = path;
    this.parent = parent;
    this.type = type;
    this.mode = mode;
    this.owner = owner;
    this.group = group;
    this.uid = uid;
    this.gid = gid;
    this.content = content;
    this.target = target;
    this.mtime = mtime;
    this.atime = mtime;
    this.ctime = mtime;
    this.children = type === 'dir' ? new Map() : null;
  }

  get size() {
    if (this.type === 'file') return Buffer.byteLength(this.content, 'utf8');
    if (this.type === 'link') return this.target.length;
    return 4096;
  }

  isDir() {
    return this.type === 'dir';
  }

  isFile() {
    return this.type === 'file';
  }

  isLink() {
    return this.type === 'link';
  }
}

export class Fs {
  constructor({ user = 'analyst', uid = 1000, gid = 1000, groups = ['analysts'] } = {}) {
    this.user = user;
    this.uid = uid;
    this.gid = gid;
    this.groups = groups;
    this.root = new FsNode({
      name: '/',
      path: '/',
      type: 'dir',
      mode: 0o755,
      owner: 'root',
      group: 'root',
      uid: 0,
      gid: 0,
    });
  }

  /* ---------------------------------------------------------------- identity */

  get isRoot() {
    return this.uid === 0;
  }

  owns(node) {
    return node.uid === this.uid;
  }

  inGroup(node) {
    return node.gid === this.gid || this.groups.includes(node.group);
  }

  /* ------------------------------------------------------------- permissions */

  canRead(node) {
    if (this.isRoot) return true;
    if (this.owns(node)) return Boolean(node.mode & 0o400);
    if (this.inGroup(node)) return Boolean(node.mode & 0o040);
    return Boolean(node.mode & 0o004);
  }

  canWrite(node) {
    if (this.isRoot) return true;
    if (this.owns(node)) return Boolean(node.mode & 0o200);
    if (this.inGroup(node)) return Boolean(node.mode & 0o020);
    return Boolean(node.mode & 0o002);
  }

  canExecute(node) {
    if (this.isRoot) return Boolean(node.mode & 0o111);
    if (this.owns(node)) return Boolean(node.mode & 0o100);
    if (this.inGroup(node)) return Boolean(node.mode & 0o010);
    return Boolean(node.mode & 0o001);
  }

  assertRead(node) {
    if (!this.canRead(node)) {
      throw new FsError(`Permission denied`, 'EACCES');
    }
  }

  assertWrite(node) {
    if (!this.canWrite(node)) {
      throw new FsError(`Permission denied`, 'EACCES');
    }
  }

  /* ------------------------------------------------------------------ lookup */

  normalize(path) {
    const raw = String(path ?? '').trim();
    const absolute = raw.startsWith('/');
    const parts = [];
    for (const segment of raw.split('/')) {
      if (!segment || segment === '.') continue;
      if (segment === '..') {
        parts.pop();
        continue;
      }
      parts.push(segment);
    }
    const joined = parts.join('/');
    if (absolute) return `/${joined}`;
    return joined ? `/${joined}` : '/';
  }

  resolve(cwd, target = '.') {
    const raw = String(target ?? '');
    if (!raw) return this.normalize(cwd);
    if (raw.startsWith('/')) return this.normalize(raw);
    const base = cwd === '/' ? '' : cwd;
    return this.normalize(`${base}/${raw}`);
  }

  /** Resolve a path, following symlinks (max 16 hops, like the kernel). */
  lookup(cwd, target, { follow = true } = {}) {
    const absolute = this.resolve(cwd, target);
    let current = this.root;
    const segments = absolute.split('/').filter(Boolean);

    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      if (!current.isDir()) {
        throw new FsError(`Not a directory: ${absolute}`, 'ENOTDIR');
      }
      const child = current.children.get(segment);
      if (!child) {
        throw new FsError(`No such file or directory: ${absolute}`, 'ENOENT');
      }
      if (child.isLink() && (follow || index < segments.length - 1)) {
        const resolved = this.resolveLink(child, absolute, segments, index);
        return resolved;
      }
      current = child;
    }
    return current;
  }

  resolveLink(link, absolute, segments, index) {
    let hops = 0;
    let path = absolute;
    let target = link;
    while (target.isLink()) {
      hops += 1;
      if (hops > 16) throw new FsError('Too many levels of symbolic links', 'ELOOP');
      const dir = target.parent ? target.parent.path : '/';
      const combined = target.target.startsWith('/')
        ? this.normalize(target.target)
        : this.normalize(`${dir === '/' ? '' : dir}/${target.target}`);
      path = combined;
      target = this.lookup(combined, '.', { follow: false });
    }
    const rest = segments.slice(index + 1);
    if (rest.length === 0) return target;
    const joined = `${target.path === '/' ? '' : target.path}/${rest.join('/')}`;
    return this.lookup('/', joined, { follow: true });
  }

  exists(cwd, target) {
    try {
      this.lookup(cwd, target);
      return true;
    } catch {
      return false;
    }
  }

  stat(cwd, target) {
    return this.lookup(cwd, target, { follow: false });
  }

  parentOf(node) {
    if (!node.parent) return null;
    return node.parent;
  }

  /* ------------------------------------------------------------------ mutate */

  ensureDir(cwd, target, { mode = 0o755, owner, group, uid, gid } = {}) {
    const absolute = this.resolve(cwd, target);
    const segments = absolute.split('/').filter(Boolean);
    let current = this.root;
    for (const segment of segments) {
      let child = current.children.get(segment);
      if (!child) {
        child = new FsNode({
          name: segment,
          path: current.path === '/' ? `/${segment}` : `${current.path}/${segment}`,
          parent: current,
          type: 'dir',
          mode,
          owner: owner ?? this.user,
          group: group ?? this.groups[0] ?? 'analysts',
          uid: uid ?? this.uid,
          gid: gid ?? this.gid,
        });
        current.children.set(segment, child);
      } else if (!child.isDir()) {
        throw new FsError(`Not a directory: ${child.path}`, 'ENOTDIR');
      }
      current = child;
    }
    return current;
  }

  writeFile(cwd, target, content, { mode = 0o644, append = false } = {}) {
    const absolute = this.resolve(cwd, target);
    const segments = absolute.split('/').filter(Boolean);
    const name = segments.pop();
    if (!name) throw new FsError(`Is a directory: ${absolute}`, 'EISDIR');
    const parentPath = `/${segments.join('/')}`.replace('//', '/');
    const parent = this.lookup('/', parentPath || '/');
    if (!parent.isDir()) throw new FsError(`Not a directory: ${parentPath}`, 'ENOTDIR');
    this.assertWrite(parent);

    const existing = parent.children.get(name);
    if (existing) {
      this.assertWrite(existing);
      existing.content = append ? existing.content + content : content;
      existing.mtime = Date.now();
      return existing;
    }
    const node = new FsNode({
      name,
      path: parent.path === '/' ? `/${name}` : `${parent.path}/${name}`,
      parent,
      type: 'file',
      mode,
      owner: this.user,
      group: this.groups[0] ?? 'analysts',
      uid: this.uid,
      gid: this.gid,
      content,
    });
    parent.children.set(name, node);
    return node;
  }

  mkdir(cwd, target, { mode = 0o755, recursive = false } = {}) {
    const absolute = this.resolve(cwd, target);
    if (this.exists('/', absolute)) {
      if (!recursive) throw new FsError(`File exists: ${absolute}`, 'EEXIST');
      return this.lookup('/', absolute);
    }
    if (!recursive) {
      const parentPath = absolute.slice(0, absolute.lastIndexOf('/')) || '/';
      const parent = this.lookup('/', parentPath);
      if (!parent.isDir()) throw new FsError(`Not a directory: ${parentPath}`, 'ENOTDIR');
      this.assertWrite(parent);
      const name = absolute.slice(absolute.lastIndexOf('/') + 1);
      const node = new FsNode({
        name,
        path: absolute,
        parent,
        type: 'dir',
        mode,
        owner: this.user,
        group: this.groups[0] ?? 'analysts',
        uid: this.uid,
        gid: this.gid,
      });
      parent.children.set(name, node);
      return node;
    }
    return this.ensureDir('/', absolute, { mode });
  }

  remove(cwd, target, { recursive = false } = {}) {
    const node = this.lookup(cwd, target, { follow: false });
    if (node === this.root) throw new FsError('Cannot remove /', 'EPERM');
    const parent = this.parentOf(node);
    if (!parent) throw new FsError('Cannot remove root', 'EPERM');
    this.assertWrite(parent);
    if (node.isDir() && node.children.size > 0 && !recursive) {
      throw new FsError(`Directory not empty: ${node.path}`, 'ENOTEMPTY');
    }
    parent.children.delete(node.name);
    return node;
  }

  copy(cwd, source, destination, { recursive = false } = {}) {
    const from = this.lookup(cwd, source);
    const toPath = this.resolve(cwd, destination);
    if (this.exists('/', toPath) && this.lookup('/', toPath).isDir()) {
      const node = this.clone(from, this.lookup('/', toPath));
      this.lookup('/', toPath).children.set(node.name, node);
      return node;
    }
    const parentPath = toPath.slice(0, toPath.lastIndexOf('/')) || '/';
    const parent = this.lookup('/', parentPath);
    if (!parent.isDir()) throw new FsError(`Not a directory: ${parentPath}`, 'ENOTDIR');
    this.assertWrite(parent);
    if (from.isDir() && !recursive) {
      throw new FsError(`omitting directory '${from.path}'`, 'EISDIR');
    }
    const node = this.clone(from, parent);
    parent.children.set(node.name, node);
    return node;
  }

  clone(from, parent) {
    const path = parent.path === '/' ? `/${from.name}` : `${parent.path}/${from.name}`;
    const node = new FsNode({
      name: from.name,
      path,
      parent,
      type: from.type,
      mode: from.mode,
      owner: from.owner,
      group: from.group,
      uid: from.uid,
      gid: from.gid,
      content: from.content,
      target: from.target,
      mtime: from.mtime,
    });
    if (from.isDir()) {
      for (const child of from.children.values()) {
        const cloned = this.clone(child, node);
        node.children.set(cloned.name, cloned);
      }
    }
    return node;
  }

  rename(cwd, source, destination) {
    const from = this.lookup(cwd, source);
    const toPath = this.resolve(cwd, destination);
    const parentPath = toPath.slice(0, toPath.lastIndexOf('/')) || '/';
    const parent = this.lookup('/', parentPath);
    if (!parent.isDir()) throw new FsError(`Not a directory: ${parentPath}`, 'ENOTDIR');
    this.assertWrite(parent);
    if (this.exists('/', toPath)) this.remove('/', toPath, { recursive: true });
    const oldParent = this.parentOf(from);
    oldParent.children.delete(from.name);
    from.name = toPath.slice(toPath.lastIndexOf('/') + 1);
    from.path = toPath;
    from.parent = parent;
    parent.children.set(from.name, from);
    this.reindex(from);
    return from;
  }

  reindex(node) {
    if (!node.isDir()) return;
    for (const child of node.children.values()) {
      child.parent = node;
      child.path = node.path === '/' ? `/${child.name}` : `${node.path}/${child.name}`;
      this.reindex(child);
    }
  }

  link(cwd, source, destination, { symbolic = true } = {}) {
    const toPath = this.resolve(cwd, destination);
    const parentPath = toPath.slice(0, toPath.lastIndexOf('/')) || '/';
    const parent = this.lookup('/', parentPath);
    const name = toPath.slice(toPath.lastIndexOf('/') + 1);
    if (parent.children.has(name)) throw new FsError(`File exists: ${toPath}`, 'EEXIST');
    const node = new FsNode({
      name,
      path: toPath,
      parent,
      type: symbolic ? 'link' : 'file',
      mode: symbolic ? 0o777 : 0o644,
      owner: this.user,
      group: this.groups[0] ?? 'analysts',
      uid: this.uid,
      gid: this.gid,
      target: symbolic ? String(source) : null,
      content: symbolic ? '' : this.lookup(cwd, source).content,
    });
    parent.children.set(name, node);
    return node;
  }

  chmod(cwd, target, mode) {
    const node = this.lookup(cwd, target);
    if (!this.isRoot && !this.owns(node)) {
      throw new FsError(`Operation not permitted`, 'EPERM');
    }
    node.mode = mode & 0o7777;
    return node;
  }

  chown(cwd, target, owner, group) {
    const node = this.lookup(cwd, target);
    if (!this.isRoot) throw new FsError(`Operation not permitted`, 'EPERM');
    if (owner) {
      node.owner = owner;
      node.uid = 0;
    }
    if (group) {
      node.group = group;
      node.gid = 0;
    }
    return node;
  }

  readFile(cwd, target) {
    const node = this.lookup(cwd, target);
    if (node.isDir()) throw new FsError(`Is a directory: ${node.path}`, 'EISDIR');
    this.assertRead(node);
    return node.content;
  }

  readdir(cwd, target = '.') {
    const node = this.lookup(cwd, target);
    if (!node.isDir()) throw new FsError(`Not a directory: ${node.path}`, 'ENOTDIR');
    this.assertRead(node);
    return [...node.children.values()];
  }

  /** Recursively collect nodes under a directory (used by find/tree/grep -r). */
  walk(cwd, target = '.', { maxDepth = Infinity } = {}) {
    const root = this.lookup(cwd, target);
    const results = [];
    const visit = (node, depth) => {
      results.push({ node, depth });
      if (!node.isDir() || depth >= maxDepth) return;
      for (const child of [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name))) {
        visit(child, depth + 1);
      }
    };
    visit(root, 0);
    return results;
  }
}

/**
 * Helper used by labs and the base image: mount a plain description object
 * into the tree. Intermediate directories are created as root-owned.
 *
 * Spec format: { '/path/to/file': { content, mode, owner, group, uid, gid, mtime } }
 * A value of `{ type: 'dir' }` mounts a directory instead of a file.
 */
export function mountTree(fs, spec, defaults = {}) {
  for (const [path, value] of Object.entries(spec)) {
    const options = typeof value === 'string' ? { content: value } : (value ?? {});
    const segments = path.split('/').filter(Boolean);
    const name = segments.pop();
    let parent = fs.root;
    for (const segment of segments) {
      const existing = parent.children.get(segment);
      if (existing && existing.isDir()) {
        parent = existing;
        continue;
      }
      parent = fs.ensureDir('/', `${parent.path === '/' ? '' : parent.path}/${segment}`, {
        mode: 0o755,
        owner: 'root',
        group: 'root',
        uid: 0,
        gid: 0,
      });
    }
    const target = parent.path === '/' ? `/${name}` : `${parent.path}/${name}`;

    if (options.type === 'dir') {
      fs.ensureDir('/', target, { mode: options.mode ?? 0o755 });
      const dir = fs.lookup('/', target, { follow: false });
      dir.owner = options.owner ?? defaults.owner ?? 'root';
      dir.group = options.group ?? defaults.group ?? 'root';
      dir.uid = options.uid ?? defaults.uid ?? 0;
      dir.gid = options.gid ?? defaults.gid ?? 0;
      if (options.mtime) dir.mtime = options.mtime;
      continue;
    }

    fs.writeFile('/', target, options.content ?? '', { mode: options.mode ?? 0o644 });
    const node = fs.lookup('/', target, { follow: false });
    node.owner = options.owner ?? defaults.owner ?? 'root';
    node.group = options.group ?? defaults.group ?? 'root';
    node.uid = options.uid ?? defaults.uid ?? 0;
    node.gid = options.gid ?? defaults.gid ?? 0;
    if (options.mtime) node.mtime = options.mtime;
  }
  return fs;
}
