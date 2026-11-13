/** Text processing commands: grep, sed, awk and friends. */

import { err, escapeRegExp, formatSize, out, parseFlags, splitLines, toRegex } from './util.js';

function readInputs(context, operands, { allowMissingStdin = false } = {}) {
  if (operands.length === 0) {
    if (!allowMissingStdin && context.stdin === '') return { files: [], text: '' };
    return { files: [], text: context.stdin };
  }
  const chunks = [];
  const files = [];
  for (const file of operands) {
    if (file === '-') {
      chunks.push(context.stdin);
      continue;
    }
    try {
      chunks.push(context.fs.readFile(context.cwd, file));
      files.push(file);
    } catch (error) {
      err(context, `grep: ${file}: ${error.code === 'EACCES' ? 'Permission denied' : 'No such file or directory'}`);
      return null;
    }
  }
  return { files, text: chunks.join('') };
}

function withLineNumbers(lines) {
  const width = String(lines.length).length;
  return lines.map((line, index) => `${String(index + 1).padStart(width)}  ${line}`);
}

export const textCommands = {
  grep: {
    usage: 'grep [options] PATTERN FILE...',
    summary: 'search for a pattern in files',
    run(context) {
      const { flags, operands } = parseFlags(context.args, {
        boolean: ['i', 'v', 'n', 'r', 'c', 'l', 'L', 'o', 'w', 'x', 'q', 'E', 'F', 'h', 's', 'a'],
        withValue: ['e', 'm', 'A', 'B', 'C'],
      });
      const pattern = flags.e ?? operands.shift();
      if (pattern === undefined) {
        err(context, 'Usage: grep [OPTION]... PATTERNS [FILE]...');
        return 2;
      }
      const regex = toRegex(pattern, {
        fixed: Boolean(flags.F),
        extended: Boolean(flags.E),
        ignoreCase: Boolean(flags.i),
      });
      const recursive = Boolean(flags.r);
      const files = [];

      if (recursive) {
        const roots = operands.length > 0 ? operands : ['.'];
        for (const root of roots) {
          try {
            for (const { node } of context.fs.walk(context.cwd, root)) {
              if (node.isFile()) files.push(node.path);
            }
          } catch (error) {
            err(context, `grep: ${root}: No such file or directory`);
            return 2;
          }
        }
      } else {
        files.push(...operands);
      }

      const showName = files.length > 1 && !flags.h;
      let matched = 0;
      let count = 0;

      for (const file of files) {
        let content;
        try {
          content = file === '-' ? context.stdin : context.fs.readFile(context.cwd, file);
        } catch (error) {
          err(context, `grep: ${file}: ${error.code === 'EACCES' ? 'Permission denied' : 'No such file or directory'}`);
          return 2;
        }
        const lines = splitLines(content);
        let fileMatched = 0;
        const output = [];

        lines.forEach((line, index) => {
          const hit = regex.test(line);
          if (hit === Boolean(flags.v)) return;
          fileMatched += 1;
          matched += 1;
          count += 1;
          if (flags.c || flags.l || flags.L || flags.q) return;

          const prefix = flags.n ? `${index + 1}:` : '';
          const name = showName ? `${file}:` : '';
          if (flags.o) {
            for (const piece of line.match(regex) ?? []) {
              output.push(`${name}${prefix}${piece}`);
            }
            return;
          }
          output.push(`${name}${prefix}${line}`);
        });

        if (flags.c) {
          out(context, `${showName ? `${file}:` : ''}${fileMatched}`);
        } else if (flags.l) {
          if (fileMatched > 0) out(context, file);
        } else if (flags.L) {
          if (fileMatched === 0) out(context, file);
        } else if (flags.q) {
          if (fileMatched > 0) return 0;
        } else if (output.length > 0) {
          out(context, output.join('\n'));
        }
      }

      return matched > 0 ? 0 : 1;
    },
  },

  egrep: {
    usage: 'egrep PATTERN FILE...',
    summary: 'search for an extended regular expression',
    run(context) {
      context.args = ['-E', ...context.args];
      return textCommands.grep.run(context);
    },
  },

  fgrep: {
    usage: 'fgrep PATTERN FILE...',
    summary: 'search for a fixed string',
    run(context) {
      context.args = ['-F', ...context.args];
      return textCommands.grep.run(context);
    },
  },

  head: {
    usage: 'head [-n N] [FILE...]',
    summary: 'output the first part of files',
    run(context) {
      const { flags, operands, numeric } = parseFlags(context.args, { withValue: ['n', 'c'], aliases: { lines: 'n', bytes: 'c' } });
      const count = Number(flags.n ?? numeric[0] ?? 10);
      const inputs = readInputs(context, operands);
      if (!inputs) return 1;
      const lines = splitLines(inputs.text).slice(0, count);
      if (inputs.files.length > 1) {
        for (const file of inputs.files) out(context, `==> ${file} <==`);
      }
      out(context, lines.join('\n'));
      return 0;
    },
  },

  tail: {
    usage: 'tail [-n N] [FILE...]',
    summary: 'output the last part of files',
    run(context) {
      const { flags, operands, numeric } = parseFlags(context.args, { withValue: ['n', 'c'], aliases: { lines: 'n', bytes: 'c' } });
      const count = Number(flags.n ?? numeric[0] ?? 10);
      const inputs = readInputs(context, operands);
      if (!inputs) return 1;
      const lines = splitLines(inputs.text);
      const start = count >= 0 ? Math.max(0, lines.length - count) : 0;
      if (inputs.files.length > 1) {
        for (const file of inputs.files) out(context, `==> ${file} <==`);
      }
      out(context, lines.slice(start).join('\n'));
      return 0;
    },
  },

  wc: {
    usage: 'wc [-l|-w|-c] [FILE...]',
    summary: 'count lines, words and bytes',
    run(context) {
      const { flags, operands } = parseFlags(context.args, { boolean: ['l', 'w', 'c', 'm'] });
      const inputs = readInputs(context, operands);
      if (!inputs) return 1;
      const text = inputs.text;
      const lines = text === '' ? 0 : splitLines(text).length;
      const words = text.split(/\s+/).filter(Boolean).length;
      const bytes = Buffer.byteLength(text, 'utf8');
      const parts = [];
      if (flags.l) parts.push(String(lines));
      if (flags.w) parts.push(String(words));
      if (flags.c || flags.m) parts.push(String(bytes));
      if (parts.length === 0) parts.push(String(lines), String(words), String(bytes));
      out(context, `${parts.join(' ')}\t${inputs.files.length === 1 ? inputs.files[0] : 'total'}`);
      return 0;
    },
  },

  sort: {
    usage: 'sort [options] [FILE...]',
    summary: 'sort lines of text',
    run(context) {
      const { flags, operands } = parseFlags(context.args, {
        boolean: ['r', 'n', 'u', 'f', 'b', 't', 'k'],
        withValue: ['t', 'k'],
      });
      const inputs = readInputs(context, operands);
      if (!inputs) return 1;
      let lines = splitLines(inputs.text);
      const separator = flags.t ? String(flags.t) : null;
      const keyField = flags.k ? Number(flags.k) : null;

      const keyOf = (line) => {
        if (!separator) return line;
        const parts = line.split(separator);
        const index = (keyField ?? 1) - 1;
        return parts[index] ?? '';
      };

      lines = lines.map((line, index) => ({ line, index, key: keyOf(line) }));
      lines.sort((a, b) => {
        let comparison;
        if (flags.n) comparison = Number(a.key) - Number(b.key);
        else comparison = a.key.localeCompare(b.key);
        if (comparison === 0) comparison = a.index - b.index;
        return flags.r ? -comparison : comparison;
      });
      let result = lines.map((entry) => entry.line);
      if (flags.u) result = [...new Set(result)];
      out(context, result.join('\n'));
      return 0;
    },
  },

  uniq: {
    usage: 'uniq [-c] [FILE]',
    summary: 'filter adjacent duplicate lines',
    run(context) {
      const { flags, operands } = parseFlags(context.args, { boolean: ['c', 'i', 'u'] });
      const inputs = readInputs(context, operands);
      if (!inputs) return 1;
      const lines = splitLines(inputs.text);
      const groups = [];
      for (const line of lines) {
        const last = groups[groups.length - 1];
        if (last && last.line === line) last.count += 1;
        else groups.push({ line, count: 1 });
      }
      for (const group of groups) {
        out(context, flags.c ? `${String(group.count).padStart(7)} ${group.line}` : group.line);
      }
      return 0;
    },
  },

  cut: {
    usage: 'cut -d DELIM -f LIST [FILE...]',
    summary: 'cut out selected fields of each line',
    run(context) {
      const { flags, operands } = parseFlags(context.args, { withValue: ['d', 'f', 'c'] });
      const delimiter = flags.d ? String(flags.d) : '\t';
      const inputs = readInputs(context, operands);
      if (!inputs) return 1;
      if (!flags.f && !flags.c) {
        err(context, 'cut: you must specify a list of bytes, characters, or fields');
        return 1;
      }
      const lines = splitLines(inputs.text);
      for (const line of lines) {
        if (flags.c) {
          const positions = String(flags.c).split(',').flatMap((part) => {
            if (part.includes('-')) {
              const [from, to] = part.split('-').map(Number);
              return Array.from({ length: to - from + 1 }, (_, index) => from + index);
            }
            return [Number(part)];
          });
          out(context, positions.map((position) => line[position - 1] ?? '').join(''));
          continue;
        }
        const fields = line.split(delimiter);
        const wanted = String(flags.f).split(',').flatMap((part) => {
          if (part.includes('-')) {
            const [from, to] = part.split('-').map(Number);
            return Array.from({ length: to - from + 1 }, (_, index) => from + index);
          }
          return [Number(part)];
        });
        out(context, wanted.map((index) => fields[index - 1] ?? '').join(delimiter));
      }
      return 0;
    },
  },

  tr: {
    usage: 'tr [-d] [-s] SET1 [SET2]',
    summary: 'translate, squeeze or delete characters',
    run(context) {
      const { flags, operands } = parseFlags(context.args, { boolean: ['d', 's'] });
      const [set1, set2] = operands;
      if (!set1) {
        err(context, 'Usage: tr [OPTION]... SET1 [SET2]');
        return 1;
      }
      const expand = (set) => {
        let output = '';
        for (let index = 0; index < set.length; index += 1) {
          const char = set[index];
          if (char === '\\' && set[index + 1] === 'n') {
            output += '\n';
            index += 1;
            continue;
          }
          if (char === '\\' && set[index + 1] === 't') {
            output += '\t';
            index += 1;
            continue;
          }
          if (char === '\\') {
            output += set[index + 1] ?? '\\';
            index += 1;
            continue;
          }
          if (char === '[') {
            const close = set.indexOf(']', index + 1);
            if (close !== -1) {
              const body = set.slice(index + 1, close);
              if (body.includes('-')) {
                const [from, to] = body.split('-');
                const start = from.charCodeAt(0);
                const end = to.charCodeAt(0);
                for (let code = start; code <= end; code += 1) output += String.fromCharCode(code);
              } else {
                output += body;
              }
              index = close;
              continue;
            }
          }
          // POSIX range syntax such as `a-z`.
          if (set[index + 1] === '-' && index + 2 < set.length && set[index + 2] !== ']') {
            const start = char.charCodeAt(0);
            const end = set[index + 2].charCodeAt(0);
            if (start <= end) {
              for (let code = start; code <= end; code += 1) output += String.fromCharCode(code);
              index += 2;
              continue;
            }
          }
          output += char;
        }
        return output;
      };

      const from = expand(set1);
      const to = set2 ? expand(set2) : '';

      if (flags.d) {
        let result = '';
        for (const char of context.stdin) {
          if (!from.includes(char)) result += char;
        }
        context.stdout.write(result);
        return 0;
      }

      if (!set2) {
        err(context, 'tr: missing operand after ‘SET1’');
        return 1;
      }

      const rotated = to.length === 1 ? to : to.padEnd(from.length, from[from.length - 1]);
      let result = '';
      for (const char of context.stdin) {
        const index = from.indexOf(char);
        if (index === -1) {
          result += char;
          continue;
        }
        result += rotated[index] ?? rotated[rotated.length - 1];
      }
      if (flags.s) {
        result = result.replace(/(.)\1+/g, '$1');
      }
      context.stdout.write(result);
      return 0;
    },
  },

  rev: {
    usage: 'rev [FILE...]',
    summary: 'reverse the characters of each line',
    run(context) {
      const inputs = readInputs(context, context.args);
      if (!inputs) return 1;
      const result = splitLines(inputs.text).map((line) => [...line].reverse().join(''));
      out(context, result.join('\n'));
      return 0;
    },
  },

  nl: {
    usage: 'nl [FILE...]',
    summary: 'number lines',
    run(context) {
      const inputs = readInputs(context, context.args);
      if (!inputs) return 1;
      const lines = withLineNumbers(splitLines(inputs.text));
      out(context, lines.join('\n'));
      return 0;
    },
  },

  tee: {
    usage: 'tee [-a] FILE...',
    summary: 'copy standard input to files and standard output',
    run(context) {
      const { flags, operands } = parseFlags(context.args, { boolean: ['a'] });
      for (const target of operands) {
        try {
          context.fs.writeFile(context.cwd, target, context.stdin, { append: Boolean(flags.a) });
        } catch (error) {
          err(context, `tee: ${target}: ${error.code === 'EACCES' ? 'Permission denied' : 'No such file or directory'}`);
          return 1;
        }
      }
      context.stdout.write(context.stdin);
      return 0;
    },
  },

  fold: {
    usage: 'fold [-w WIDTH] [FILE...]',
    summary: 'wrap lines',
    run(context) {
      const { flags, operands } = parseFlags(context.args, { withValue: ['w'] });
      const width = Number(flags.w ?? 80);
      const inputs = readInputs(context, operands);
      if (!inputs) return 1;
      const result = [];
      for (const line of splitLines(inputs.text)) {
        if (line.length <= width) {
          result.push(line);
          continue;
        }
        for (let index = 0; index < line.length; index += width) {
          result.push(line.slice(index, index + width));
        }
      }
      out(context, result.join('\n'));
      return 0;
    },
  },

  seq: {
    usage: 'seq [FIRST [INCREMENT]] LAST',
    summary: 'print a sequence of numbers',
    run(context) {
      const numbers = context.args.map(Number);
      if (numbers.length === 0 || numbers.some((value) => !Number.isFinite(value))) {
        err(context, 'Usage: seq [FIRST [INCREMENT]] LAST');
        return 1;
      }
      let [first = 1, increment = 1, last] = numbers;
      if (last === undefined) {
        last = first;
        first = 1;
      }
      if (increment === 0) {
        err(context, 'seq: increment must not be zero');
        return 1;
      }
      const result = [];
      for (let value = first; increment > 0 ? value <= last : value >= last; value += increment) {
        result.push(String(value));
        if (result.length > 10000) break;
      }
      out(context, result.join('\n'));
      return 0;
    },
  },

  xargs: {
    usage: 'xargs COMMAND',
    summary: 'build and execute command lines from standard input',
    async run(context) {
      const { operands } = parseFlags(context.args, { boolean: ['n', 'I', '0'] });
      const [command, ...prefix] = operands;
      if (!command) {
        err(context, 'Usage: xargs [options] [command [initial-arguments]]');
        return 1;
      }
      const items = context.stdin.split(/\s+/).filter(Boolean);
      const definition = context.shell.registry.get(command);
      if (!definition) {
        err(context, `xargs: ${command}: command not found`);
        return 127;
      }
      let code = 0;
      for (const item of items) {
        const expanded = prefix.map((argument) => argument.replaceAll('{}', item));
        const result = await definition.run({ ...context, args: expanded, argv: expanded });
        code = result ?? 0;
      }
      return code;
    },
  },

  sed: {
    usage: 'sed SCRIPT [FILE...]',
    summary: 'stream editor for filtering and transforming text',
    run(context) {
      const { flags, operands } = parseFlags(context.args, { boolean: ['n', 'e'] });
      const [script, ...files] = operands;
      if (!script) {
        err(context, 'Usage: sed [OPTION]... {script} [input-file]...');
        return 1;
      }
      const inputs = readInputs(context, files);
      if (!inputs) return 1;
      const lines = splitLines(inputs.text);

      const program = [];
      for (const statement of script.split(/;(?![^\[]*\])/)) {
        const trimmed = statement.trim();
        if (!trimmed) continue;
        program.push(parseSedStatement(trimmed));
      }

      let printed = 0;
      const output = [];

      lines.forEach((line, index) => {
        let active = true;
        let suppress = false;
        for (const statement of program) {
          if (!statement) continue;
          if (statement.address) {
            const address = statement.address;
            let matched;
            if (address.type === 'regex') matched = new RegExp(address.pattern).test(line);
            else if (address.type === 'line') matched = index + 1 === address.value;
            else if (address.type === 'last') matched = index === lines.length - 1;
            else if (address.type === 'range') {
              matched = index + 1 >= address.from
                && (address.to === null || index + 1 <= address.to
                  || (address.toType === 'regex' && new RegExp(address.to).test(line)));
            }
            if (!matched) continue;
          }
          if (statement.action === 's') {
            const regex = new RegExp(statement.pattern, statement.replaceAll ? 'g' : '');
            if (regex.test(line)) {
              line = line.replace(regex, statement.replacement);
              if (statement.flags.includes('g')) statement.replaceAll = true;
            }
          } else if (statement.action === 'p') {
            output.push(line);
            printed += 1;
          } else if (statement.action === 'd') {
            suppress = true;
          }
        }
        if (!suppress && !flags.n) {
          output.push(line);
          printed += 1;
        }
      });

      out(context, output.join('\n'));
      return 0;
    },
  },

  awk: {
    usage: 'awk [-F sep] PROGRAM [FILE...]',
    summary: 'pattern scanning and processing language',
    run(context) {
      const { flags, operands } = parseFlags(context.args, { withValue: ['F', 'v'] });
      const [program, ...files] = operands;
      if (!program) {
        err(context, 'Usage: awk [-F fs] [-v var=value] program [file ...]');
        return 1;
      }
      const inputs = readInputs(context, files);
      if (!inputs) return 1;
      const separator = flags.F ? String(flags.F) : /\s+/;
      const lines = splitLines(inputs.text);
      const output = [];

      for (const rule of parseAwkProgram(program)) {
        for (let index = 0; index < lines.length; index += 1) {
          const fields = lines[index].split(separator);
          const record = {
            line: lines[index],
            fields,
            NR: index + 1,
            NF: fields.length,
            vars: {},
          };
          const pattern = rule.pattern;
          let matched = true;
          if (pattern) {
            if (pattern.type === 'regex') matched = new RegExp(pattern.value).test(lines[index]);
            else if (pattern.type === 'expression') matched = Boolean(evaluateAwk(record, pattern.value));
          }
          if (!matched) continue;
          for (const statement of rule.actions) {
            const result = evaluateAwkStatement(record, statement);
            if (result !== undefined && result !== null) output.push(String(result));
          }
        }
      }

      out(context, output.join('\n'));
      return 0;
    },
  },

  column: {
    usage: 'column -t [FILE...]',
    summary: 'align text into columns',
    run(context) {
      const inputs = readInputs(context, context.args);
      if (!inputs) return 1;
      const rows = splitLines(inputs.text).map((line) => line.split(/\s{2,}|\t/));
      const widths = [];
      for (const row of rows) {
        row.forEach((cell, index) => {
          widths[index] = Math.max(widths[index] ?? 0, cell.length);
        });
      }
      const rendered = rows.map((row) => row.map((cell, index) => cell.padEnd(widths[index])).join('  ').trimEnd());
      out(context, rendered.join('\n'));
      return 0;
    },
  },
};

/* --------------------------------------------------------------- sed parsing */

function parseSedStatement(statement) {
  const address = parseSedAddress(statement);
  let body = statement;
  if (address) body = statement.slice(address.length).trim();

  if (body.startsWith('s/')) {
    const parsed = parseSubstitute(body);
    return { ...address, ...parsed };
  }
  if (body === 'p') return { ...address, action: 'p' };
  if (body === 'd') return { ...address, action: 'd' };
  if (body === 'q') return { ...address, action: 'q' };
  if (body === 's///') return { ...address, action: 's' };
  return { ...address, action: 'noop' };
}

function parseSedAddress(statement) {
  if (statement.startsWith('/')) {
    const end = statement.indexOf('/', 1);
    if (end !== -1) {
      return { type: 'regex', pattern: statement.slice(1, end), length: end + 1 };
    }
  }
  const rangeMatch = /^(\d+)(,(\d+|\/.*\/))?/.exec(statement);
  if (rangeMatch) {
    const from = Number(rangeMatch[1]);
    if (rangeMatch[3]) {
      if (rangeMatch[3].startsWith('/')) {
        const end = rangeMatch[3].lastIndexOf('/');
        return {
          type: 'range',
          from,
          to: rangeMatch[3].slice(1, end),
          toType: 'regex',
          length: rangeMatch[0].length,
        };
      }
      return { type: 'range', from, to: Number(rangeMatch[3]), toType: 'line', length: rangeMatch[0].length };
    }
    return { type: 'line', value: from, length: rangeMatch[0].length };
  }
  if (statement.startsWith('$')) return { type: 'last', length: 1 };
  return null;
}

function parseSubstitute(body) {
  const delimiter = body[1];
  const parts = [];
  let current = '';
  let index = 2;
  while (index < body.length) {
    const char = body[index];
    if (char === '\\') {
      current += body[index + 1] ?? '';
      index += 2;
      continue;
    }
    if (char === delimiter) {
      parts.push(current);
      current = '';
      index += 1;
      continue;
    }
    current += char;
    index += 1;
  }
  parts.push(current);
  const [pattern, replacement = '', flags = ''] = parts;
  return {
    action: 's',
    pattern,
    replacement: replacement.replace(/&/g, '$&'),
    flags,
    replaceAll: flags.includes('g'),
  };
}

/* --------------------------------------------------------------- awk parsing */

function parseAwkProgram(program) {
  const rules = [];
  const pattern = /(\/.*?\/[^\n]*|\{[^\n]*\})/g;
  let match;
  while ((match = pattern.exec(program)) !== null) {
    const chunk = match[0];
    if (chunk.startsWith('{')) {
      const actions = chunk.slice(1, -1).split(/;\s*/).filter(Boolean);
      rules.push({ pattern: null, actions: actions.map((action) => action.trim()) });
      continue;
    }
    const regexMatch = /^\/(.*?)\//.exec(chunk);
    const actions = chunk.slice(regexMatch[0].length).match(/\{[^]*\}/);
    rules.push({
      pattern: { type: 'regex', value: regexMatch[1] },
      actions: actions ? actions[0].slice(1, -1).split(/;\s*/).filter(Boolean) : [],
    });
  }
  if (rules.length === 0) rules.push({ pattern: null, actions: [] });
  return rules;
}

function evaluateAwkStatement(record, statement) {
  if (statement.startsWith('print')) {
    const expression = statement.slice(5).trim();
    if (!expression) return record.line;
    const parts = splitTopLevel(expression, ',');
    const values = parts.map((part) => evaluateAwk(record, part.trim()));
    return values.join(' ');
  }
  if (statement.startsWith('printf')) {
    const expression = statement.slice(6).trim();
    const [format, ...args] = splitTopLevel(expression, ',');
    let index = 0;
    return format.replace(/%[sdifg%]/g, (token) => {
      if (token === '%%') return '%';
      const value = evaluateAwk(record, args[index]?.trim() ?? '""');
      index += 1;
      if (token === '%d' || token === '%i') return String(Math.trunc(Number(value) || 0));
      if (token === '%f') return String(Number(value) || 0);
      if (token === '%g') return String(Number(value) || 0);
      return String(value);
    });
  }
  const assignment = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/.exec(statement);
  if (assignment) {
    record.vars[assignment[1]] = evaluateAwk(record, assignment[2].trim());
    return undefined;
  }
  return undefined;
}

function evaluateAwk(record, expression) {
  const trimmed = String(expression ?? '').trim();
  if (!trimmed) return '';

  if (/^".*"$/.test(trimmed) || /^'.*'$/.test(trimmed)) {
    return trimmed.slice(1, -1);
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (trimmed === 'NR') return record.NR;
  if (trimmed === 'NF') return record.NF;
  if (trimmed === '$0') return record.line;
  const field = /^\$(\d+)$/.exec(trimmed);
  if (field) return record.fields[Number(field[1]) - 1] ?? '';
  if (trimmed in record.vars) return record.vars[trimmed];

  // Support `a b` style concatenation of simple terms.
  const terms = splitConcatenation(trimmed);
  if (terms.length > 1) {
    return terms.map((term) => String(evaluateAwk(record, term))).join('');
  }
  return trimmed;
}

function splitConcatenation(expression) {
  const terms = [];
  let current = '';
  let inString = null;
  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index];
    if (inString) {
      current += char;
      if (char === inString) inString = null;
      continue;
    }
    if (char === '"' || char === "'") {
      inString = char;
      current += char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        terms.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }
  if (current) terms.push(current);
  return terms;
}

function splitTopLevel(text, separator) {
  const parts = [];
  let current = '';
  let depth = 0;
  let inString = null;
  for (const char of text) {
    if (inString) {
      current += char;
      if (char === inString) inString = null;
      continue;
    }
    if (char === '"' || char === "'") {
      inString = char;
      current += char;
      continue;
    }
    if (char === '(' || char === '[' || char === '{') depth += 1;
    if (char === ')' || char === ']' || char === '}') depth -= 1;
    if (char === separator && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts;
}

export { escapeRegExp, formatSize };
