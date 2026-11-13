/**
 * Shell engine for the simulated terminal.
 *
 * Supports the subset of bash that operators actually use during a CTF:
 * quoting, escapes, variable expansion, globbing, pipelines, redirections,
 * `&&` / `||` / `;` chaining, aliases and a persistent history.
 */

export class ShellError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.name = 'ShellError';
    this.code = code;
  }
}

/* ------------------------------------------------------------------ tokenizer */

const OPERATORS = ['&&', '||', '>>', '2>&1', '2>', '|', ';', '>', '<', '(', ')'];

/**
 * Split a raw command line into tokens, honouring quotes and escapes.
 * Returns { words, operators } where operators are structural markers.
 */
export function tokenize(input) {
  const tokens = [];
  let current = '';
  let started = false;
  let quote = null;

  const push = () => {
    if (started) {
      tokens.push({ type: 'word', value: current });
      current = '';
      started = false;
    }
  };

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (quote) {
      if (char === quote) {
        quote = null;
        continue;
      }
      if (char === '\\' && quote === '"') {
        const next = input[index + 1];
        if (next === '"' || next === '\\' || next === '$' || next === '`') {
          current += next;
          index += 1;
          continue;
        }
      }
      current += char;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      started = true;
      continue;
    }

    if (char === '\\') {
      const next = input[index + 1];
      if (next === undefined) {
        current += '\\';
        started = true;
        continue;
      }
      current += next;
      started = true;
      index += 1;
      continue;
    }

    if (char === ' ') {
      push();
      continue;
    }

    const operator = OPERATORS.find((candidate) => input.startsWith(candidate, index));
    if (operator) {
      push();
      tokens.push({ type: 'op', value: operator });
      index += operator.length - 1;
      continue;
    }

    current += char;
    started = true;
  }

  push();
  return tokens;
}

/* ----------------------------------------------------------------- expansion */

export function expandVariables(word, env) {
  return word.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, braced, bare) => {
    const name = braced ?? bare;
    return env[name] ?? '';
  });
}

function globToRegExp(pattern) {
  let source = '^';
  for (const char of pattern) {
    if (char === '*') source += '.*';
    else if (char === '?') source += '.';
    else if (char === '[') source += '[';
    else if (char === ']') source += ']';
    else source += char.replace(/[.+^${}()|\\]/g, '\\$&');
  }
  return new RegExp(`${source}$`);
}

/** Expand `*` and `?` wildcards against the filesystem. */
export function expandGlobs(words, fs, cwd) {
  const expanded = [];
  for (const word of words) {
    if (!/[*?]/.test(word)) {
      expanded.push(word);
      continue;
    }
    const matches = [];
    const slash = word.lastIndexOf('/');
    const dirPart = slash >= 0 ? word.slice(0, slash) : '';
    const namePart = slash >= 0 ? word.slice(slash + 1) : word;
    let base = cwd;
    if (dirPart) {
      try {
        base = fs.resolve(cwd, dirPart);
      } catch {
        expanded.push(word);
        continue;
      }
    }
    try {
      const regex = globToRegExp(namePart);
      for (const child of fs.readdir(base)) {
        if (regex.test(child.name)) {
          matches.push(dirPart ? `${dirPart}/${child.name}` : child.name);
        }
      }
    } catch {
      expanded.push(word);
      continue;
    }
    if (matches.length === 0) {
      expanded.push(word);
      continue;
    }
    matches.sort();
    expanded.push(...matches);
  }
  return expanded;
}

/* --------------------------------------------------------------------- parser */

/**
 * Parse a token stream into pipelines.
 *
 * A pipeline is a list of simple commands joined by `|`. Pipelines are joined
 * to each other by `&&`, `||` or `;`.
 */
export function parse(tokens) {
  const pipelines = [];
  let current = { commands: [], joiner: null };
  let simple = { words: [], redirects: [] };

  const endSimple = () => {
    if (simple.words.length > 0 || simple.redirects.length > 0) current.commands.push(simple);
    simple = { words: [], redirects: [] };
  };

  const endPipeline = () => {
    endSimple();
    if (current.commands.length > 0) pipelines.push(current);
    current = { commands: [], joiner: null };
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === 'word') {
      simple.words.push(token.value);
      continue;
    }
    switch (token.value) {
      case '|':
        endSimple();
        break;
      case '&&':
      case '||':
      case ';':
        endPipeline();
        current.joiner = token.value;
        break;
      case '>':
      case '>>':
      case '<': {
        const target = tokens[index + 1];
        if (!target || target.type !== 'word') throw new ShellError('syntax error near unexpected token');
        simple.redirects.push({ type: token.value === '<' ? 'input' : 'output', target: target.value, append: token.value === '>>' });
        index += 1;
        break;
      }
      case '2>':
      case '2>&1': {
        if (token.value === '2>&1') {
          simple.redirects.push({ type: 'stderr-to-stdout' });
          break;
        }
        const target = tokens[index + 1];
        if (!target || target.type !== 'word') throw new ShellError('syntax error near unexpected token');
        simple.redirects.push({ type: 'stderr', target: target.value, append: false });
        index += 1;
        break;
      }
      case '(':
      case ')':
        throw new ShellError(`syntax error near unexpected token \`${token.value}'`);
      default:
        break;
    }
  }
  endPipeline();
  return pipelines;
}

/* ------------------------------------------------------------------- streams */

export class OutputStream {
  constructor() {
    this.chunks = [];
  }

  write(text) {
    if (!text) return;
    this.chunks.push(String(text));
  }

  toString() {
    return this.chunks.join('');
  }
}

export class ErrorStream {
  constructor() {
    this.chunks = [];
  }

  write(text) {
    if (!text) return;
    this.chunks.push(String(text));
  }

  toString() {
    return this.chunks.join('');
  }
}

/* ------------------------------------------------------------------- session */

export class Shell {
  /**
   * @param {object} options
   * @param {import('./vfs.js').Fs} options.fs
   * @param {Map<string, object>} options.registry command registry
   */
  constructor({ fs, registry, env = {}, cwd = '/home/analyst', user = 'analyst', hostname = 'kali-lab', platform = 'linux-gnu', lab = null, session = null, onCommand }) {
    this.fs = fs;
    this.registry = registry;
    this.cwd = cwd;
    this.user = user;
    this.hostname = hostname;
    this.platform = platform;
    this.lab = lab;
    this.session = session;
    this.onCommand = onCommand;
    this.env = {
      PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      HOME: '/home/analyst',
      USER: user,
      LOGNAME: user,
      SHELL: '/bin/bash',
      TERM: 'xterm-256color',
      LANG: 'en_US.UTF-8',
      PWD: cwd,
      HOSTNAME: hostname,
      ...env,
    };
    this.aliases = new Map();
    this.history = [];
    this.lastStatus = 0;
  }

  prompt() {
    const short = this.cwd.startsWith(this.env.HOME ?? '/home/analyst')
      ? `~${this.cwd.slice((this.env.HOME ?? '/home/analyst').length)}`
      : this.cwd;
    return `\x1b[1;32m${this.user}\x1b[0m@\x1b[1;32m${this.hostname}\x1b[0m:\x1b[1;34m${short}\x1b[0m$ `;
  }

  resolveAlias(word) {
    let current = word;
    const seen = new Set();
    while (this.aliases.has(current) && !seen.has(current)) {
      seen.add(current);
      current = this.aliases.get(current);
    }
    return current;
  }

  /** Expand aliases at the head of a command word list. */
  applyAliases(words) {
    if (words.length === 0) return words;
    const resolved = this.resolveAlias(words[0]);
    if (resolved === words[0]) return words;
    const replacement = tokenize(resolved)
      .filter((token) => token.type === 'word')
      .map((token) => token.value);
    return [...replacement, ...words.slice(1)];
  }

  /**
   * Execute a raw command line.
   * @returns {Promise<{stdout: string, stderr: string, code: number}>}
   */
  async run(rawInput) {
    const input = String(rawInput ?? '');
    const trimmed = input.trim();
    if (!trimmed) return { stdout: '', stderr: '', code: 0 };

    this.history.push(input);
    if (this.history.length > 500) this.history.shift();

    let stdout = '';
    let stderr = '';
    let code = 0;

    try {
      const tokens = tokenize(trimmed);
      const pipelines = parse(tokens);
      let stdout = '';
      let stderr = '';
      let code = 0;

      for (const pipeline of pipelines) {
        if (pipeline.joiner === '&&' && code !== 0) continue;
        if (pipeline.joiner === '||' && code === 0) continue;

        const result = await this.runPipeline(pipeline);
        stdout += result.stdout;
        stderr += result.stderr;
        code = result.code;
        this.lastStatus = result.code;
      }
      this.env.PWD = this.cwd;
      return { stdout, stderr, code };
    } catch (error) {
      const message = error instanceof ShellError ? error.message : error.message;
      return { stdout, stderr: `${stderr}${message}\n`, code: error.code ?? 1 };
    }
  }

  /**
   * Execute one pipeline. Each stage receives the previous stage's stdout as
   * its standard input; redirections are applied to the first/last stage.
   */
  async runPipeline(pipeline) {
    let stdout = '';
    let stderr = '';
    let code = 0;
    let stdin = '';

    for (let index = 0; index < pipeline.commands.length; index += 1) {
      const simple = pipeline.commands[index];
      const isLast = index === pipeline.commands.length - 1;

      const result = await this.runSimple(simple, { stdin });
      stderr += result.stderr;
      code = result.code;
      stdin = result.stdout;

      // Only the final stage writes to the terminal; earlier stages are piped.
      if (isLast) stdout += result.stdout;
    }

    return { stdout, stderr, code };
  }

  async runSimple(simple, { stdin = '', capture = true } = {}) {
    let words = simple.words.map((word) => expandVariables(word, this.env));
    words = this.applyAliases(words);
    words = expandGlobs(words, this.fs, this.cwd);

    if (words.length === 0) return { stdout: '', stderr: '', code: 0 };

    const commandName = words[0];
    const definition = this.registry.get(commandName);

    if (!definition) {
      return {
        stdout: '',
        stderr: `bash: ${commandName}: command not found\n`,
        code: 127,
      };
    }

    const stdout = new OutputStream();
    const stderr = new ErrorStream();

    const context = {
      shell: this,
      fs: this.fs,
      cwd: this.cwd,
      env: this.env,
      user: this.user,
      hostname: this.hostname,
      lab: this.lab,
      session: this.session,
      stdout,
      stderr,
      argv: words.slice(1),
      args: words.slice(1),
      stdin,
      exit(code = 0) {
        throw new ShellExit(code);
      },
    };

    let result;
    try {
      result = (await definition.run(context)) ?? 0;
    } catch (error) {
      if (error instanceof ShellExit) {
        result = error.code;
      } else if (error?.code === 'ENOENT') {
        stderr.write(`${error.message}\n`);
        result = 1;
      } else if (error?.code === 'EACCES') {
        stderr.write('Permission denied\n');
        result = 1;
      } else {
        stderr.write(`${error.message}\n`);
        result = 1;
      }
    }

    let finalStdout = stdout.toString();
    const finalStderr = stderr.toString();

    // Apply redirections.
    for (const redirect of simple.redirects) {
      if (redirect.type === 'output') {
        try {
          this.fs.writeFile(this.cwd, redirect.target, finalStdout, { append: redirect.append });
        } catch (error) {
          return { stdout: '', stderr: `bash: ${redirect.target}: ${error.message}\n`, code: 1 };
        }
        finalStdout = '';
      } else if (redirect.type === 'input') {
        try {
          stdin = this.fs.readFile(this.cwd, redirect.target);
        } catch {
          return { stdout: '', stderr: `bash: ${redirect.target}: No such file or directory\n`, code: 1 };
        }
      } else if (redirect.type === 'stderr') {
        try {
          this.fs.writeFile(this.cwd, redirect.target, finalStderr, { append: redirect.append });
        } catch {
          /* ignore */
        }
      }
    }

    return {
      stdout: capture ? finalStdout : finalStdout,
      stderr: finalStderr,
      code: result,
    };
  }
}

export class ShellExit extends Error {
  constructor(code = 0) {
    super(`exit ${code}`);
    this.name = 'ShellExit';
    this.code = code;
  }
}
