/** File system manipulation commands. */

import { FsError, modeString, octal } from '../vfs.js';
import { err, formatLongTimestamp, formatSize, formatTimestamp, out, parseFlags, printTable } from './util.js';

function reportError(context, tool, target, error) {
  const reason = {
    ENOENT: 'No such file or directory',
    EACCES: 'Permission denied',
    EISDIR: 'Is a directory',
    ENOTDIR: 'Not a directory',
    EEXIST: 'File exists',
    ENOTEMPTY: 'Directory not empty',
    EPERM: 'Operation not permitted',
  }[error.code] ?? error.message;
  err(context, `${tool}: cannot ${describeOperation(tool)} '${target}': ${reason}`);
  return 1;
}

function describeOperation(tool) {
  const verbs = {
    rm: 'remove', rmdir: 'remove', mkdir: 'create', cp: 'copy', mv: 'move',
    ln: 'create link', chmod: 'change mode of', chown: 'change ownership of',
    touch: 'touch', stat: 'stat', cat: 'open', truncate: 'truncate',
  };
  return verbs[tool] ?? 'access';
}

export const fsCommands = {
  mkdir: {
    usage: 'mkdir [-p] DIR...',
    summary: 'create directories',
    run(context) {
      const { flags, operands } = parseFlags(context.args, { boolean: ['p'] });
      if (operands.length === 0) {
        err(context, 'mkdir: missing operand');
        return 1;
      }
      for (const target of operands) {
        try {
          context.fs.mkdir(context.cwd, target, { recursive: Boolean(flags.p) });
        } catch (error) {
          return reportError(context, 'mkdir', target, error);
        }
      }
      return 0;
    },
  },

  touch: {
    usage: 'touch FILE...',
    summary: 'create files or update timestamps',
    run(context) {
      if (context.args.length === 0) {
        err(context, 'touch: missing file operand');
        return 1;
      }
      for (const target of context.args) {
        try {
          if (context.fs.exists(context.cwd, target)) {
            const node = context.fs.lookup(context.cwd, target);
            node.mtime = Date.now();
            continue;
          }
          const node = context.fs.writeFile(context.cwd, target, '');
          node.mtime = Date.now();
        } catch (error) {
          return reportError(context, 'touch', target, error);
        }
      }
      return 0;
    },
  },

  rm: {
    usage: 'rm [-r] [-f] FILE...',
    summary: 'remove files or directories',
    run(context) {
      const { flags, operands } = parseFlags(context.args, { boolean: ['r', 'f', 'R', 'v'] });
      if (operands.length === 0) {
        err(context, 'rm: missing operand');
        return 1;
      }
      const recursive = Boolean(flags.r || flags.R);
      for (const target of operands) {
        try {
          context.fs.remove(context.cwd, target, { recursive });
          if (flags.v) out(context, `removed '${target}'`);
        } catch (error) {
          if (flags.f && (error.code === 'ENOENT')) continue;
          return reportError(context, 'rm', target, error);
        }
      }
      return 0;
    },
  },

  rmdir: {
    usage: 'rmdir DIR...',
    summary: 'remove empty directories',
    run(context) {
      for (const target of context.args) {
        try {
          context.fs.remove(context.cwd, target, { recursive: false });
        } catch (error) {
          return reportError(context, 'rmdir', target, error);
        }
      }
      return 0;
    },
  },

  cp: {
    usage: 'cp [-r] SOURCE... DEST',
    summary: 'copy files and directories',
    run(context) {
      const { flags, operands } = parseFlags(context.args, { boolean: ['r', 'R', 'v', 'a'] });
      if (operands.length < 2) {
        err(context, 'cp: missing destination file operand');
        return 1;
      }
      const destination = operands[operands.length - 1];
      const sources = operands.slice(0, -1);
      for (const source of sources) {
        try {
          context.fs.copy(context.cwd, source, destination, { recursive: Boolean(flags.r || flags.R || flags.a) });
          if (flags.v) out(context, `copied '${source}'`);
        } catch (error) {
          return reportError(context, 'cp', source, error);
        }
      }
      return 0;
    },
  },

  mv: {
    usage: 'mv SOURCE... DEST',
    summary: 'move or rename files',
    run(context) {
      if (context.args.length < 2) {
        err(context, 'mv: missing destination file operand');
        return 1;
      }
      const destination = context.args[context.args.length - 1];
      for (const source of context.args.slice(0, -1)) {
        try {
          context.fs.rename(context.cwd, source, destination);
        } catch (error) {
          return reportError(context, 'mv', source, error);
        }
      }
      return 0;
    },
  },

  ln: {
    usage: 'ln [-s] TARGET LINK',
    summary: 'create links',
    run(context) {
      const { flags, operands } = parseFlags(context.args, { boolean: ['s'] });
      if (operands.length < 2) {
        err(context, 'ln: missing file operand');
        return 1;
      }
      try {
        context.fs.link(context.cwd, operands[0], operands[1], { symbolic: Boolean(flags.s) });
      } catch (error) {
        return reportError(context, 'ln', operands[1], error);
      }
      return 0;
    },
  },

  chmod: {
    usage: 'chmod MODE FILE...',
    summary: 'change file permissions',
    run(context) {
      const { operands } = parseFlags(context.args, { boolean: ['R', 'v'] });
      const [modeText, ...targets] = operands;
      if (!modeText || targets.length === 0) {
        err(context, 'chmod: missing operand');
        return 1;
      }
      const mode = parseMode(modeText);
      if (mode === null) {
        err(context, `chmod: invalid mode: '${modeText}'`);
        return 1;
      }
      for (const target of targets) {
        try {
          context.fs.chmod(context.cwd, target, mode);
        } catch (error) {
          return reportError(context, 'chmod', target, error);
        }
      }
      return 0;
    },
  },

  chown: {
    usage: 'chown OWNER[:GROUP] FILE...',
    summary: 'change file ownership',
    run(context) {
      const [ownerText, ...targets] = context.args;
      if (!ownerText || targets.length === 0) {
        err(context, 'chown: missing operand');
        return 1;
      }
      const [owner, group] = ownerText.split(':');
      for (const target of targets) {
        try {
          context.fs.chown(context.cwd, target, owner, group);
        } catch (error) {
          return reportError(context, 'chown', target, error);
        }
      }
      return 0;
    },
  },

  stat: {
    usage: 'stat FILE...',
    summary: 'display file metadata',
    run(context) {
      if (context.args.length === 0) {
        err(context, 'stat: missing operand');
        return 1;
      }
      for (const target of context.args) {
        try {
          const node = context.fs.lookup(context.cwd, target, { follow: false });
          out(context, `  File: ${node.path}`);
          out(context, `  Size: ${node.size}\t\tBlocks: ${Math.ceil(node.size / 512)}\t\t${node.type === 'dir' ? 'directory' : node.type === 'link' ? 'symbolic link' : 'regular file'}`);
          out(context, `Access: (${octal(node.mode)}/${modeString(node.mode, node.type)})  Uid: (${node.uid}/${node.owner})   Gid: (${node.gid}/${node.group})`);
          out(context, `Modify: ${formatLongTimestamp(node.mtime)}`);
          if (node.isLink()) out(context, `  -> ${node.target}`);
          out(context, '');
        } catch (error) {
          return reportError(context, 'stat', target, error);
        }
      }
      return 0;
    },
  },

  file: {
    usage: 'file FILE...',
    summary: 'determine the type of a file',
    run(context) {
      if (context.args.length === 0) {
        err(context, 'file: missing operand');
        return 1;
      }
      for (const target of context.args) {
        try {
          const node = context.fs.lookup(context.cwd, target);
          out(context, `${target}: ${describeFile(node)}`);
        } catch (error) {
          return reportError(context, 'file', target, error);
        }
      }
      return 0;
    },
  },

  du: {
    usage: 'du [-sh] [path...]',
    summary: 'estimate file space usage',
    run(context) {
      const { flags, operands } = parseFlags(context.args, { boolean: ['s', 'h', 'a'] });
      const targets = operands.length > 0 ? operands : ['.'];
      for (const target of targets) {
        try {
          const node = context.fs.lookup(context.cwd, target);
          if (node.isDir()) {
            const entries = context.fs.walk(context.cwd, target);
            const total = entries.reduce((sum, entry) => sum + entry.node.size, 0);
            if (flags.s) {
              out(context, `${flags.h ? formatSize(total) : total}\t${target}`);
            } else {
              for (const entry of entries) {
                if (entry.depth === 0) continue;
                out(context, `${flags.h ? formatSize(entry.node.size) : entry.node.size}\t${entry.node.path}`);
              }
            }
          } else {
            out(context, `${flags.h ? formatSize(node.size) : node.size}\t${target}`);
          }
        } catch (error) {
          return reportError(context, 'du', target, error);
        }
      }
      return 0;
    },
  },

  df: {
    usage: 'df [-h]',
    summary: 'report file system disk usage',
    run(context) {
      const rows = [
        ['Filesystem', 'Size', 'Used', 'Avail', 'Use%', 'Mounted on'],
        ['/dev/sda1', '128G', '31G', '82G', '25%', '/'],
        ['/dev/sda2', '512M', '180M', '281M', '40%', '/boot'],
        ['tmpfs', '7.8G', '1.2G', '6.6G', '16%', '/run'],
      ];
      out(context, printTable(rows));
      return 0;
    },
  },

  tree: {
    usage: 'tree [options] [path]',
    summary: 'show the directory structure',
    run(context) {
      const { flags, operands } = parseFlags(context.args, { boolean: ['a', 'd', 'f', 'h', 'L'] });
      const target = operands[0] ?? '.';
      let root;
      try {
        root = context.fs.lookup(context.cwd, target);
      } catch (error) {
        return reportError(context, 'tree', target, error);
      }
      out(context, target);
      const directories = [];

      const visit = (node, prefix) => {
        const children = [...node.children.values()]
          .filter((child) => flags.a || !child.name.startsWith('.'))
          .sort((a, b) => a.name.localeCompare(b.name));
        children.forEach((child, index) => {
          const last = index === children.length - 1;
          out(context, `${prefix}${last ? '└── ' : '├── '}${child.name}`);
          if (child.isDir()) {
            directories.push(child.path);
            visit(child, `${prefix}${last ? '    ' : '│   '}`);
          }
        });
      };

      visit(root, '');
      if (flags.d) out(context, `\n${directories.length} directories`);
      return 0;
    },
  },

  find: {
    usage: 'find [path] [expression]',
    summary: 'search for files and directories',
    run(context) {
      const operands = context.args.filter((arg) => !arg.startsWith('-'));
      const flags = parseFlags(context.args, { boolean: ['L'] }).flags;
      const start = operands[0] ?? '.';

      const expression = context.args.slice(context.args.indexOf(start) + 1);
      let namePattern = null;
      let typeFilter = null;
      let permFilter = null;
      let maxDepth = Infinity;
      let sizeFilter = null;
      let userFilter = null;

      for (let index = 0; index < expression.length; index += 1) {
        const token = expression[index];
        if (token === '-name') { namePattern = expression[index + 1]; index += 1; }
        else if (token === '-iname') { namePattern = expression[index + 1]; index += 1; }
        else if (token === '-type') { typeFilter = expression[index + 1]; index += 1; }
        else if (token === '-perm') { permFilter = expression[index + 1]; index += 1; }
        else if (token === '-maxdepth') { maxDepth = Number(expression[index + 1]); index += 1; }
        else if (token === '-size') { sizeFilter = expression[index + 1]; index += 1; }
        else if (token === '-user') { userFilter = expression[index + 1]; index += 1; }
      }
      void flags;

      let entries;
      try {
        entries = context.fs.walk(context.cwd, start, { maxDepth });
      } catch (error) {
        return reportError(context, 'find', start, error);
      }

      for (const { node } of entries) {
        if (namePattern) {
          const regex = new RegExp(`^${namePattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
          if (!regex.test(node.name)) continue;
        }
        if (typeFilter === 'f' && !node.isFile()) continue;
        if (typeFilter === 'd' && !node.isDir()) continue;
        if (typeFilter === 'l' && !node.isLink()) continue;
        if (permFilter) {
          const wanted = parseMode(permFilter);
          if (wanted === null || (node.mode & 0o777) !== (wanted & 0o777)) continue;
        }
        if (userFilter && node.owner !== userFilter) continue;
        if (sizeFilter) {
          const match = /^([+-]?\d+)([ckMG]?)$/.exec(sizeFilter);
          if (match) {
            const scale = { c: 1, k: 1024, M: 1024 ** 2, G: 1024 ** 3 }[match[2]] ?? 1;
            const wanted = Number(match[1]) * scale;
            if (match[1].startsWith('+') ? !(node.size > wanted) : node.size !== wanted) continue;
          }
        }
        out(context, node.path);
      }
      return 0;
    },
  },

  readlink: {
    usage: 'readlink FILE',
    summary: 'print the target of a symbolic link',
    run(context) {
      for (const target of context.args) {
        try {
          const node = context.fs.lookup(context.cwd, target, { follow: false });
          if (!node.isLink()) {
            err(context, `readlink: ${target}: Invalid argument`);
            return 1;
          }
          out(context, node.target);
        } catch (error) {
          return reportError(context, 'readlink', target, error);
        }
      }
      return 0;
    },
  },

  realpath: {
    usage: 'realpath FILE...',
    summary: 'print the canonical path',
    run(context) {
      for (const target of context.args) {
        try {
          out(context, context.fs.lookup(context.cwd, target).path);
        } catch (error) {
          return reportError(context, 'realpath', target, error);
        }
      }
      return 0;
    },
  },

  basename: {
    usage: 'basename PATH',
    summary: 'print the final component of a path',
    run(context) {
      const [path] = context.args;
      if (!path) return 1;
      const parts = path.replace(/\/+$/, '').split('/');
      out(context, parts[parts.length - 1] || '/');
      return 0;
    },
  },

  dirname: {
    usage: 'dirname PATH',
    summary: 'print the directory component of a path',
    run(context) {
      const [path] = context.args;
      if (!path) return 1;
      const trimmed = path.replace(/\/+$/, '');
      const index = trimmed.lastIndexOf('/');
      if (index <= 0) out(context, index === 0 ? '/' : '.');
      else out(context, trimmed.slice(0, index));
      return 0;
    },
  },

  mktemp: {
    usage: 'mktemp [-d] [template]',
    summary: 'create a temporary file or directory',
    run(context) {
      const { flags, operands } = parseFlags(context.args, { boolean: ['d'] });
      const template = operands[0] ?? '/tmp/tmp.XXXXXXXXXX';
      const unique = Math.random().toString(36).slice(2, 12).toUpperCase();
      const path = template.replace(/X+/, unique);
      try {
        if (flags.d) context.fs.mkdir(context.cwd, path, { recursive: true });
        else context.fs.writeFile(context.cwd, path, '');
      } catch (error) {
        return reportError(context, 'mktemp', path, error);
      }
      out(context, path);
      return 0;
    },
  },

  truncate: {
    usage: 'truncate -s SIZE FILE',
    summary: 'truncate a file to a given size',
    run(context) {
      const { flags, operands } = parseFlags(context.args, { withValue: ['s'] });
      const [target] = operands;
      if (!target) {
        err(context, 'truncate: missing file operand');
        return 1;
      }
      const size = Number(flags.s ?? 0);
      try {
        const node = context.fs.lookup(context.cwd, target);
        node.content = node.content.slice(0, size);
      } catch (error) {
        return reportError(context, 'truncate', target, error);
      }
      return 0;
    },
  },

  split: {
    usage: 'split FILE PREFIX',
    summary: 'split a file into chunks',
    run(context) {
      const [target, prefix] = context.args;
      if (!target || !prefix) {
        err(context, 'split: missing operand');
        return 1;
      }
      try {
        const content = context.fs.readFile(context.cwd, target);
        const chunks = content.match(/.{1,1000}/gs) ?? [];
        chunks.forEach((chunk, index) => {
          context.fs.writeFile(context.cwd, `${prefix}${String(index).padStart(2, '0')}`, chunk);
        });
      } catch (error) {
        return reportError(context, 'split', target, error);
      }
      return 0;
    },
  },
};

function parseMode(text) {
  if (/^[0-7]{3,4}$/.test(text)) return parseInt(text, 8);
  const symbolic = /^([ugoa]*)([=+-])([rwxXst]*)$/.exec(text);
  if (!symbolic) return null;
  const [, whoText, operator, permissionText] = symbolic;
  const who = whoText.includes('a') ? 'a' : whoText || 'a';
  const shifts = { u: 6, g: 3, o: 0, a: 0 };
  let mode = 0;
  const apply = (shift) => {
    if (permissionText.includes('r')) mode |= 0o4 << shift;
    if (permissionText.includes('w')) mode |= 0o2 << shift;
    if (permissionText.includes('x') || permissionText.includes('X')) mode |= 0o1 << shift;
  };
  if (who === 'a') {
    apply(6);
    apply(3);
    apply(0);
  } else {
    apply(shifts[who]);
  }
  if (operator === '=') return mode;
  return mode;
}

export { FsError };
