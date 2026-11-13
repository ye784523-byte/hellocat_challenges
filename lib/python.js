/**
 * A compact Python interpreter covering the subset operators use during a CTF:
 * variables, control flow, functions, lists, dictionaries, strings and the
 * common builtins. It is intentionally small — it exists so that challenge
 * artefacts (Vigenère, XOR gates, base64 chains) can be solved inside the
 * terminal rather than on paper.
 */

import crypto from 'node:crypto';

class PyError extends Error {
  constructor(message, type = 'Exception') {
    super(message);
    this.name = type;
    this.pyType = type;
  }
}

class PyReturn {
  constructor(value) {
    this.value = value;
  }
}

class PyBreak {}

class PyContinue {}

class PyFunction {
  constructor(name, params, body, closure) {
    this.name = name;
    this.params = params;
    this.body = body;
    this.closure = closure;
  }
}

/** A minimal immutable byte string, enough for decoding artefacts. */
class PyBytes {
  constructor(buffer) {
    this.buffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(String(buffer), 'utf8');
  }

  static fromHex(text) {
    const cleaned = String(text).replace(/\s+/g, '');
    return new PyBytes(Buffer.from(cleaned, 'hex'));
  }

  static fromString(text) {
    return new PyBytes(Buffer.from(text, 'utf8'));
  }

  hex() {
    return this.buffer.toString('hex');
  }

  decode(encoding = 'utf-8') {
    return this.buffer.toString(encoding === 'utf-8' ? 'utf8' : encoding);
  }

  get length() {
    return this.buffer.length;
  }
}

const KEYWORDS = new Set([
  'if', 'elif', 'else', 'while', 'for', 'in', 'def', 'return', 'break', 'continue',
  'pass', 'and', 'or', 'not', 'import', 'from', 'as', 'True', 'False', 'None',
  'is', 'del', 'global', 'lambda', 'try', 'except', 'finally', 'raise', 'with',
  'assert', 'yield', 'nonlocal', 'class', 'await', 'async',
]);

/* ------------------------------------------------------------------- lexer */

function tokenizePython(source) {
  const tokens = [];
  let index = 0;
  let line = 1;
  let bracketDepth = 0;
  let atLineStart = true;
  const indents = [0];

  const push = (type, value) => {
    tokens.push({ type, value, line });
  };

  const measureIndent = () => {
    let width = 0;
    while (index < source.length && (source[index] === ' ' || source[index] === '\t')) {
      width += source[index] === '\t' ? 8 - (width % 8) : 1;
      index += 1;
    }
    // Blank lines and comment-only lines carry no indentation information.
    if (index >= source.length || source[index] === '\n' || source[index] === '#') {
      while (index < source.length && source[index] !== '\n') index += 1;
      if (index < source.length) {
        index += 1;
        line += 1;
      }
      // Stay at the start of a line so the next statement is measured too.
      atLineStart = true;
      return null;
    }
    const top = indents[indents.length - 1];
    if (width > top) {
      indents.push(width);
      push('indent', width);
    } else if (width < top) {
      while (indents.length > 1 && indents[indents.length - 1] > width) {
        indents.pop();
        push('dedent', width);
      }
    }
    return width;
  };

  while (index < source.length) {
    if (atLineStart && bracketDepth === 0) {
      atLineStart = false;
      if (measureIndent() === null) continue;
    }

    const char = source[index];

    if (char === '\n') {
      if (bracketDepth === 0) {
        push('newline', '\n');
        atLineStart = true;
      }
      index += 1;
      line += 1;
      continue;
    }
    if (char === ' ' || char === '\t' || char === '\r') {
      index += 1;
      continue;
    }
    if (char === '#') {
      while (index < source.length && source[index] !== '\n') index += 1;
      continue;
    }
    if (char === '\\' && source[index + 1] === '\n') {
      index += 2;
      line += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      const quote = char;
      let value = '';
      const triple = source.startsWith(quote.repeat(3), index);
      if (triple) {
        index += 3;
        while (index < source.length && !source.startsWith(quote.repeat(3), index)) {
          if (source[index] === '\\') {
            value += unescapeChar(source[index + 1]);
            index += 2;
            continue;
          }
          if (source[index] === '\n') line += 1;
          value += source[index];
          index += 1;
        }
        index += 3;
      } else {
        index += 1;
        while (index < source.length && source[index] !== quote) {
          if (source[index] === '\\') {
            value += unescapeChar(source[index + 1]);
            index += 2;
            continue;
          }
          if (source[index] === '\n') break;
          value += source[index];
          index += 1;
        }
        index += 1;
      }
      push('string', value);
      continue;
    }
    if (/[0-9]/.test(char) || (char === '.' && /[0-9]/.test(source[index + 1] ?? ''))) {
      let value = '';
      while (index < source.length && /[0-9a-fA-FxXoObB._]/.test(source[index])) {
        if ((source[index] === 'e' || source[index] === 'E') && /[+-]/.test(source[index + 1] ?? '')) {
          value += source[index];
          index += 1;
          value += source[index];
          index += 1;
          continue;
        }
        value += source[index];
        index += 1;
      }
      push('number', value);
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      let value = '';
      while (index < source.length && /[A-Za-z0-9_]/.test(source[index])) {
        value += source[index];
        index += 1;
      }
      // `b"..."` / `B'...'` introduce a bytes literal.
      if ((value === 'b' || value === 'B') && (source[index] === '"' || source[index] === "'")) {
        push('bytesprefix', value);
        continue;
      }
      push(KEYWORDS.has(value) ? 'keyword' : 'name', value);
      continue;
    }
    const three = source.slice(index, index + 3);
    if (['**=', '//=', '>>=', '<<=', '...'].includes(three)) {
      push('op', three);
      index += 3;
      continue;
    }
    const two = source.slice(index, index + 2);
    if (['==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '%=', '**', '//', '<<', '>>', '->', '^=', '&=', '|='].includes(two)) {
      push('op', two);
      index += 2;
      continue;
    }
    if ('+-*/%=<>!()[]{},:.;@^&|~'.includes(char)) {
      if ('([{'.includes(char)) bracketDepth += 1;
      if (')]}'.includes(char)) bracketDepth = Math.max(0, bracketDepth - 1);
      push('op', char);
      index += 1;
      continue;
    }
    throw new PyError(`invalid character ${JSON.stringify(char)}`, 'SyntaxError');
  }

  while (indents.length > 1) {
    indents.pop();
    push('dedent', 0);
  }
  push('newline', '\n');
  push('eof', null);
  return tokens;
}

function unescapeChar(char) {
  switch (char) {
    case 'n': return '\n';
    case 't': return '\t';
    case 'r': return '\r';
    case '0': return '\0';
    case '\\': return '\\';
    case "'": return "'";
    case '"': return '"';
    default: return char ?? '';
  }
}

/* ------------------------------------------------------------------ parser */

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.position = 0;
  }

  peek(offset = 0) {
    return this.tokens[this.position + offset] ?? { type: 'eof', value: null };
  }

  next() {
    const token = this.tokens[this.position];
    this.position += 1;
    return token;
  }

  at(type, value) {
    const token = this.peek();
    if (token.type !== type) return false;
    if (value === undefined) return true;
    return token.value === value;
  }

  match(type, value) {
    if (this.at(type, value)) {
      this.next();
      return true;
    }
    return false;
  }

  expect(type, value) {
    if (!this.match(type, value)) {
      const token = this.peek();
      throw new PyError(`expected ${value ?? type} but found ${token.value ?? 'end of file'}`, 'SyntaxError');
    }
  }

  skipNewlines() {
    while (this.at('newline') || this.at('op', ';')) this.next();
  }

  parseProgram() {
    const body = [];
    this.skipNewlines();
    while (!this.at('eof')) {
      body.push(...this.parseStatement());
      this.skipNewlines();
    }
    return body;
  }

  /** Parse an indented suite following a `:`. */
  parseBlock() {
    this.expect('op', ':');
    if (this.at('newline')) {
      this.next();
      this.skipNewlines();
      if (!this.at('indent')) {
        throw new PyError('expected an indented block', 'IndentationError');
      }
      this.next();
      const body = [];
      while (!this.at('eof') && !this.at('dedent')) {
        body.push(...this.parseStatement());
        this.skipNewlines();
      }
      if (this.at('dedent')) this.next();
      return body;
    }
    return this.parseSimpleStatements();
  }

  parseSimpleStatements() {
    const statements = [];
    statements.push(...this.parseStatement());
    while (this.match('op', ';')) {
      if (this.at('newline')) break;
      statements.push(...this.parseStatement());
    }
    return statements;
  }

  parseStatement() {
    const token = this.peek();

    if (token.type === 'keyword') {
      switch (token.value) {
        case 'if': return this.parseIf();
        case 'while': return this.parseWhile();
        case 'for': return this.parseFor();
        case 'def': return this.parseDef();
        case 'try': return this.parseTry();
        case 'import':
        case 'from': return this.parseImport();
        case 'with': return this.parseWith();
        default: break;
      }
    }

    if (this.at('keyword', 'return')) {
      this.next();
      const value = this.at('newline') || this.at('op', ';') ? null : this.parseExpressionList();
      this.endStatement();
      return [{ type: 'return', value }];
    }
    if (this.at('keyword', 'break')) {
      this.next();
      this.endStatement();
      return [{ type: 'break' }];
    }
    if (this.at('keyword', 'continue')) {
      this.next();
      this.endStatement();
      return [{ type: 'continue' }];
    }
    if (this.at('keyword', 'pass')) {
      this.next();
      this.endStatement();
      return [{ type: 'pass' }];
    }
    if (this.at('keyword', 'raise')) {
      this.next();
      const error = this.at('newline') ? null : this.parseExpression();
      this.endStatement();
      return [{ type: 'raise', error }];
    }
    if (this.at('keyword', 'assert')) {
      this.next();
      const test = this.parseExpression();
      const message = this.match('op', ',') ? this.parseExpression() : null;
      this.endStatement();
      return [{ type: 'assert', test, message }];
    }
    if (this.at('keyword', 'del')) {
      this.next();
      const targets = this.parseExpressionList();
      this.endStatement();
      return [{ type: 'del', targets }];
    }
    if (this.at('keyword', 'global')) {
      this.next();
      const names = [];
      while (this.at('name')) {
        names.push(this.next().value);
        if (!this.match('op', ',')) break;
      }
      this.endStatement();
      return [{ type: 'global', names }];
    }

    // Assignment or expression statement.
    const start = this.position;
    const target = this.parseExpressionList();
    const operatorToken = this.peek();
    if (operatorToken.type === 'op' && (operatorToken.value === '=' || ['+=', '-=', '*=', '/=', '%=', '**=', '//=', '&=', '|=', '^='].includes(operatorToken.value))) {
      const operator = this.next().value;
      const value = this.parseExpressionList();
      this.endStatement();
      return [{ type: 'assign', target, operator, value, position: start }];
    }
    this.position = start;
    const expression = this.parseExpressionList();
    this.endStatement();
    return [{ type: 'expression', value: expression }];
  }

  endStatement() {
    if (this.at('newline')) this.next();
  }

  parseExpressionList() {
    const first = this.parseExpression();
    if (!this.at('op', ',')) return first;
    const elements = [first];
    while (this.match('op', ',')) {
      if (this.at('newline') || this.at('op', ')') || this.at('op', ']') || this.at('op', '}')) break;
      elements.push(this.parseExpression());
    }
    return { type: 'tuple', elements };
  }

  parseIf() {
    this.expect('keyword', 'if');
    const test = this.parseExpression();
    const body = this.parseBlock();
    let orelse = [];
    if (this.at('keyword', 'elif')) {
      const nested = this.parseIf();
      orelse = nested;
    } else if (this.at('keyword', 'else')) {
      this.next();
      orelse = this.parseBlock();
    }
    return [{ type: 'if', test, body, orelse }];
  }

  parseWhile() {
    this.expect('keyword', 'while');
    const test = this.parseExpression();
    const body = this.parseBlock();
    return [{ type: 'while', test, body }];
  }

  parseFor() {
    this.expect('keyword', 'for');
    const target = this.parseTargetList();
    this.expect('keyword', 'in');
    const iterable = this.parseExpressionList();
    const body = this.parseBlock();
    return [{ type: 'for', target, iterable, body }];
  }

  parseDef() {
    this.expect('keyword', 'def');
    const name = this.next().value;
    this.expect('op', '(');
    const params = [];
    while (!this.at('op', ')')) {
      if (this.match('op', '*') || this.match('op', '**')) continue;
      const param = this.next().value;
      if (this.match('op', '=')) {
        params.push({ name: param, default: this.parseExpression() });
      } else {
        params.push({ name: param, default: null });
      }
      if (!this.match('op', ',')) break;
    }
    this.expect('op', ')');
    const body = this.parseBlock();
    return [{ type: 'function', name, params, body }];
  }

  parseTry() {
    this.expect('keyword', 'try');
    const body = this.parseBlock();
    let handler = null;
    let finalBody = [];
    if (this.at('keyword', 'except')) {
      this.next();
      const name = this.at('name') ? this.next().value : null;
      const handlerBody = this.parseBlock();
      handler = { name, body: handlerBody };
    }
    if (this.at('keyword', 'finally')) {
      this.next();
      finalBody = this.parseBlock();
    }
    return [{ type: 'try', body, handler, finalBody }];
  }

  parseImport() {
    const isFrom = this.at('keyword', 'from');
    this.next();
    const moduleName = this.next().value;
    const names = [];
    if (isFrom) {
      this.expect('keyword', 'import');
      while (this.at('name')) {
        names.push(this.next().value);
        if (!this.match('op', ',')) break;
      }
    }
    let alias = null;
    if (this.at('keyword', 'as')) {
      this.next();
      alias = this.next().value;
    }
    this.endStatement();
    return [{ type: 'import', module: moduleName, names, alias, from: isFrom }];
  }

  parseWith() {
    this.expect('keyword', 'with');
    const items = [];
    do {
      const value = this.parseExpression();
      let alias = null;
      if (this.at('keyword', 'as')) {
        this.next();
        alias = this.next().value;
      }
      items.push({ value, alias });
    } while (this.match('op', ','));
    const body = this.parseBlock();
    return [{ type: 'with', items, body }];
  }

  parseTargetList() {
    const first = this.parsePrimaryTarget();
    if (!this.at('op', ',')) return first;
    const elements = [first];
    while (this.match('op', ',')) {
      elements.push(this.parsePrimaryTarget());
    }
    return { type: 'tuple', elements };
  }

  parsePrimaryTarget() {
    if (this.at('op', '[')) {
      this.next();
      const index = this.parseExpressionList();
      this.expect('op', ']');
      return { type: 'subscript', value: { type: 'name', name: '' }, index, assign: true };
    }
    const token = this.next();
    if (token.type === 'name') return { type: 'name', name: token.value };
    if (token.type === 'op' && token.value === '(') {
      const inner = this.parseTargetList();
      this.expect('op', ')');
      return inner;
    }
    throw new PyError('invalid assignment target', 'SyntaxError');
  }

  parseExpressionList() {
    const first = this.parseExpression();
    if (!this.at('op', ',')) return first;
    const elements = [first];
    while (this.match('op', ',')) {
      if (this.at('newline') || this.at('op', ')') || this.at('op', ']') || this.at('op', '}')) break;
      elements.push(this.parseExpression());
    }
    return { type: 'tuple', elements };
  }

  parseExpression() {
    return this.parseTernary();
  }

  parseTernary() {
    const value = this.parseOr();
    if (this.at('keyword', 'if')) {
      this.next();
      const test = this.parseOr();
      this.expect('keyword', 'else');
      const alternative = this.parseTernary();
      return { type: 'ternary', test, value, alternative };
    }
    return value;
  }

  parseOr() {
    let left = this.parseAnd();
    while (this.at('keyword', 'or')) {
      this.next();
      const right = this.parseAnd();
      left = { type: 'or', left, right };
    }
    return left;
  }

  parseAnd() {
    let left = this.parseNot();
    while (this.at('keyword', 'and')) {
      this.next();
      const right = this.parseNot();
      left = { type: 'and', left, right };
    }
    return left;
  }

  parseNot() {
    if (this.at('keyword', 'not')) {
      this.next();
      return { type: 'not', value: this.parseNot() };
    }
    return this.parseComparison();
  }

  parseComparison() {
    let left = this.parseArith();
    const operators = ['==', '!=', '<', '>', '<=', '>='];
    while (this.at('op') && operators.includes(this.peek().value)) {
      const operator = this.next().value;
      const right = this.parseArith();
      left = { type: 'compare', operator, left, right };
    }
    if (this.at('keyword', 'is')) {
      this.next();
      const right = this.parseArith();
      left = { type: 'compare', operator: 'is', left, right };
    }
    if (this.at('keyword', 'in')) {
      this.next();
      const right = this.parseArith();
      left = { type: 'compare', operator: 'in', left, right };
    }
    if (this.at('keyword', 'not') && this.peek(1).value === 'in') {
      this.next();
      this.next();
      const right = this.parseArith();
      left = { type: 'compare', operator: 'not in', left, right };
    }
    return left;
  }

  parseArith() {
    let left = this.parseShift();
    while (this.at('op', '+') || this.at('op', '-')) {
      const operator = this.next().value;
      const right = this.parseShift();
      left = { type: 'binary', operator, left, right };
    }
    return left;
  }

  parseShift() {
    let left = this.parseBitOr();
    while (this.at('op', '<<') || this.at('op', '>>')) {
      const operator = this.next().value;
      const right = this.parseBitOr();
      left = { type: 'binary', operator, left, right };
    }
    return left;
  }

  parseBitOr() {
    let left = this.parseBitXor();
    while (this.at('op', '|')) {
      const operator = this.next().value;
      const right = this.parseBitXor();
      left = { type: 'binary', operator, left, right };
    }
    return left;
  }

  parseBitXor() {
    let left = this.parseBitAnd();
    while (this.at('op', '^')) {
      const operator = this.next().value;
      const right = this.parseBitAnd();
      left = { type: 'binary', operator, left, right };
    }
    return left;
  }

  parseBitAnd() {
    let left = this.parseTerm();
    while (this.at('op', '&')) {
      const operator = this.next().value;
      const right = this.parseTerm();
      left = { type: 'binary', operator, left, right };
    }
    return left;
  }

  parseTerm() {
    let left = this.parseUnary();
    while (this.at('op', '*') || this.at('op', '/') || this.at('op', '%') || this.at('op', '//')) {
      const operator = this.next().value;
      const right = this.parseUnary();
      left = { type: 'binary', operator, left, right };
    }
    return left;
  }

  parseUnary() {
    if (this.at('op', '-')) {
      this.next();
      return { type: 'unary', operator: '-', value: this.parseUnary() };
    }
    if (this.at('op', '+')) {
      this.next();
      return this.parseUnary();
    }
    return this.parsePower();
  }

  parsePower() {
    const base = this.parsePostfix();
    if (this.at('op', '**')) {
      this.next();
      const exponent = this.parseUnary();
      return { type: 'binary', operator: '**', left: base, right: exponent };
    }
    return base;
  }

  parsePostfix() {
    let value = this.parseAtom();
    while (true) {
      if (this.at('op', '(')) {
        this.next();
        const args = [];
        while (!this.at('op', ')')) {
          args.push(this.parseExpression());
          if (!this.match('op', ',')) break;
        }
        this.expect('op', ')');
        value = { type: 'call', callee: value, args };
        continue;
      }
      if (this.at('op', '[')) {
        this.next();
        const index = this.parseExpressionList();
        this.expect('op', ']');
        value = { type: 'subscript', value, index };
        continue;
      }
      if (this.at('op', '.')) {
        this.next();
        const attribute = this.next().value;
        value = { type: 'attribute', value, attribute };
        continue;
      }
      break;
    }
    return value;
  }

  parseAtom() {
    const token = this.peek();

    if (token.type === 'number') {
      this.next();
      const text = token.value.replace(/_/g, '');
      if (/^0[xX]/.test(text)) return { type: 'literal', value: parseInt(text, 16) };
      if (/^0[bB]/.test(text)) return { type: 'literal', value: parseInt(text.slice(2), 2) };
      if (/^0[oO]/.test(text)) return { type: 'literal', value: parseInt(text.slice(2), 8) };
      if (text.includes('.') || /[eE]/.test(text)) return { type: 'literal', value: Number(text) };
      return { type: 'literal', value: parseInt(text, 10) };
    }
    if (token.type === 'string') {
      this.next();
      return { type: 'literal', value: token.value };
    }
    if (token.type === 'bytesprefix') {
      this.next();
      const stringToken = this.next();
      return { type: 'literal', value: PyBytes.fromString(stringToken.value) };
    }
    if (token.type === 'keyword') {
      if (token.value === 'True') { this.next(); return { type: 'literal', value: true }; }
      if (token.value === 'False') { this.next(); return { type: 'literal', value: false }; }
      if (token.value === 'None') { this.next(); return { type: 'literal', value: null }; }
      if (token.value === 'lambda') {
        this.next();
        const params = [];
        while (!this.at('op', ':')) {
          params.push(this.next().value);
          if (!this.match('op', ',')) break;
        }
        this.expect('op', ':');
        const body = this.parseExpression();
        return { type: 'lambda', params, body };
      }
    }
    if (token.type === 'name') {
      this.next();
      return { type: 'name', name: token.value };
    }
    if (token.type === 'op') {
      if (token.value === '(') {
        this.next();
        if (this.at('op', ')')) {
          this.next();
          return { type: 'tuple', elements: [] };
        }
        const first = this.parseExpression();
        if (this.at('op', ',')) {
          const elements = [first];
          while (this.match('op', ',')) {
            if (this.at('op', ')')) break;
            elements.push(this.parseExpression());
          }
          this.expect('op', ')');
          return { type: 'tuple', elements };
        }
        this.expect('op', ')');
        return first;
      }
      if (token.value === '[') {
        this.next();
        const elements = [];
        while (!this.at('op', ']')) {
          elements.push(this.parseExpression());
          if (!this.match('op', ',')) break;
        }
        this.expect('op', ']');
        return { type: 'list', elements };
      }
      if (token.value === '{') {
        this.next();
        const entries = [];
        while (!this.at('op', '}')) {
          const key = this.parseExpression();
          this.expect('op', ':');
          const value = this.parseExpression();
          entries.push([key, value]);
          if (!this.match('op', ',')) break;
        }
        this.expect('op', '}');
        return { type: 'dict', entries };
      }
    }
    throw new PyError(`invalid syntax near ${token.value ?? 'end of file'}`, 'SyntaxError');
  }
}

/* --------------------------------------------------------------- evaluator */

class Scope {
  constructor(parent = null) {
    this.variables = new Map();
    this.parent = parent;
  }

  get(name) {
    if (this.variables.has(name)) return this.variables.get(name);
    if (this.parent) return this.parent.get(name);
    throw new PyError(`name '${name}' is not defined`, 'NameError');
  }

  has(name) {
    if (this.variables.has(name)) return true;
    return this.parent ? this.parent.has(name) : false;
  }

  set(name, value) {
    this.variables.set(name, value);
  }

  assign(name, value) {
    let scope = this;
    while (scope) {
      if (scope.variables.has(name)) {
        scope.variables.set(name, value);
        return;
      }
      scope = scope.parent;
    }
    this.variables.set(name, value);
  }
}

export class PythonInterpreter {
  constructor({ write, writeError } = {}) {
    this.write = write ?? (() => {});
    this.writeError = writeError ?? (() => {});
    this.modules = new Map();
  }

  run(source, { filename = '<stdin>' } = {}) {
    const tokens = tokenizePython(source);
    const parser = new Parser(tokens);
    const program = parser.parseProgram();
    const scope = new Scope();
    this.installBuiltins(scope);
    this.installModules(scope);
    try {
      this.executeBlock(program, scope);
    } catch (error) {
      if (error instanceof PyError) {
        this.writeError(`${filename}: ${error.pyType}: ${error.message}\n`);
        return 1;
      }
      throw error;
    }
    return 0;
  }

  installBuiltins(scope) {
    const builtins = {
      print: (...args) => {
        this.write(`${args.map((value) => this.toStr(value)).join(' ')}\n`);
        return null;
      },
      len: (value) => this.lengthOf(value),
      range: (...args) => {
        const [start, stop, step] = args.map((value) => Number(value));
        if (stop === undefined) return this.makeRange(0, start, 1);
        if (step === undefined) return this.makeRange(start, stop, 1);
        return this.makeRange(start, stop, step);
      },
      list: (value) => (value === undefined ? [] : [...this.iterate(value)]),
      dict: (value) => (value === undefined ? new Map() : new Map(this.iterate(value))),
      set: (value) => new Set(value === undefined ? [] : this.iterate(value)),
      tuple: (value) => (value === undefined ? [] : [...this.iterate(value)]),
      str: (value) => this.toStr(value),
      int: (value, base) => {
        if (base !== undefined) return parseInt(this.toStr(value), base);
        const number = Number(value);
        if (Number.isNaN(number) && typeof value === 'string') {
          const trimmed = value.trim();
          if (/^0[xX]/.test(trimmed)) return parseInt(trimmed, 16);
          if (/^0[bB]/.test(trimmed)) return parseInt(trimmed.slice(2), 2);
          if (/^0[oO]/.test(trimmed)) return parseInt(trimmed.slice(2), 8);
          if (/^[+-]?\d+$/.test(trimmed)) return parseInt(trimmed, 10);
          throw new PyError(`invalid literal for int() with base 10: ${value}`, 'ValueError');
        }
        return Math.trunc(number);
      },
      float: (value) => Number(value),
      bool: (value) => Boolean(this.truthy(value)),
      abs: (value) => Math.abs(Number(value)),
      min: (...args) => this.extreme(args, true),
      max: (...args) => this.extreme(args, false),
      sum: (iterable, start = 0) => [...this.iterate(iterable)].reduce((total, value) => total + Number(value), start),
      sorted: (iterable, ...rest) => this.sorted(iterable, rest[0]),
      reversed: (iterable) => [...this.iterate(iterable)].reverse(),
      enumerate: (iterable) => [...this.iterate(iterable)].map((value, index) => [index, value]),
      zip: (...lists) => {
        const arrays = lists.map((list) => [...this.iterate(list)]);
        const length = Math.min(...arrays.map((array) => array.length));
        return Array.from({ length }, (_, index) => arrays.map((array) => array[index]));
      },
      ord: (value) => this.toStr(value).charCodeAt(0),
      chr: (value) => String.fromCharCode(Number(value)),
      hex: (value) => `0x${(Number(value) >>> 0).toString(16)}`,
      oct: (value) => `0o${(Number(value) >>> 0).toString(8)}`,
      bin: (value) => `0b${(Number(value) >>> 0).toString(2)}`,
      round: (value, digits = 0) => {
        const factor = 10 ** digits;
        return Math.round(Number(value) * factor) / factor;
      },
      any: (iterable) => [...this.iterate(iterable)].some((value) => this.truthy(value)),
      all: (iterable) => [...this.iterate(iterable)].every((value) => this.truthy(value)),
      isinstance: (value, kind) => true,
      type: (value) => this.typeName(value),
      repr: (value) => this.repr(value),
      input: () => '',
      open: (name, mode = 'r') => this.openFile(name, mode),
      hash: (value) => hashPython(this.toStr(value)),
      divmod: (a, b) => [Math.floor(Number(a) / Number(b)), Number(a) % Number(b)],
      pow: (base, exponent, modulus) => {
        const value = Number(base) ** Number(exponent);
        return modulus === undefined ? value : ((value % Number(modulus)) + Number(modulus)) % Number(modulus);
      },
      format: (value, spec) => this.formatValue(value, spec),
      bytes: {
        fromhex: (text) => PyBytes.fromHex(this.toStr(text)),
        fromString: (text) => PyBytes.fromString(this.toStr(text)),
      },
    };
    for (const [name, value] of Object.entries(builtins)) scope.set(name, value);
  }

  installModules(scope) {
    const modules = {
      base64: {
        b64encode: (value) => Buffer.from(this.toStr(value), 'utf8').toString('base64'),
        b64decode: (value) => Buffer.from(this.toStr(value), 'base64').toString('utf8'),
        b64encodebytes: (value) => Buffer.from(this.toStr(value), 'utf8').toString('base64'),
        b16encode: (value) => Buffer.from(this.toStr(value), 'utf8').toString('hex').toUpperCase(),
        b16decode: (value) => Buffer.from(this.toStr(value), 'hex').toString('utf8'),
        urlsafe_b64encode: (value) => Buffer.from(this.toStr(value), 'utf8').toString('base64url'),
        urlsafe_b64decode: (value) => Buffer.from(this.toStr(value), 'base64url').toString('utf8'),
      },
      binascii: {
        hexlify: (value) => Buffer.from(this.toStr(value), 'utf8').toString('hex'),
        unhexlify: (value) => Buffer.from(this.toStr(value), 'hex').toString('utf8'),
      },
      hashlib: {
        md5: (value) => crypto.createHash('md5').update(this.toStr(value)).digest('hex'),
        sha1: (value) => crypto.createHash('sha1').update(this.toStr(value)).digest('hex'),
        sha256: (value) => crypto.createHash('sha256').update(this.toStr(value)).digest('hex'),
      },
      string: {
        ascii_lowercase: 'abcdefghijklmnopqrstuvwxyz',
        ascii_uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        ascii_letters: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
        digits: '0123456789',
        hexdigits: '0123456789abcdefABCDEF',
        punctuation: '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~',
        printable: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~ ',
      },
      math: {
        pi: Math.PI,
        e: Math.E,
        floor: (value) => Math.floor(Number(value)),
        ceil: (value) => Math.ceil(Number(value)),
        sqrt: (value) => Math.sqrt(Number(value)),
        pow: (a, b) => Number(a) ** Number(b),
        gcd: (a, b) => {
          let x = Math.abs(Number(a));
          let y = Math.abs(Number(b));
          while (y) [x, y] = [y, x % y];
          return x;
        },
        factorial: (value) => {
          let result = 1;
          for (let index = 2; index <= Number(value); index += 1) result *= index;
          return result;
        },
      },
      json: {
        dumps: (value) => JSON.stringify(this.toPlain(value)),
        loads: (value) => JSON.parse(this.toStr(value)),
      },
      sys: {
        version: '3.11.2 (lab build)',
        argv: ['lab'],
        platform: 'linux',
        exit: () => null,
      },
      os: {
        getcwd: () => '/home/analyst',
        listdir: () => [],
        environ: {},
      },
    };
    for (const [name, definition] of Object.entries(modules)) {
      scope.set(name, new Map(Object.entries(definition)));
    }
  }

  /* --------------------------------------------------------------- helpers */

  makeRange(start, stop, step) {
    const result = [];
    if (step === 0) return result;
    if (step > 0) {
      for (let value = start; value < stop; value += step) result.push(value);
    } else {
      for (let value = start; value > stop; value += step) result.push(value);
    }
    return result;
  }

  sorted(iterable, keyFunction) {
    const items = [...this.iterate(iterable)];
    if (typeof keyFunction !== 'function') {
      items.sort((a, b) => this.compare(a, b));
      return items;
    }
    items.sort((a, b) => {
      const left = this.callFunction(keyFunction, [a]);
      const right = this.callFunction(keyFunction, [b]);
      return this.compare(left, right);
    });
    return items;
  }

  extreme(args, wantMin) {
    const values = args.length === 1 && (Array.isArray(args[0]) || args[0] instanceof Map || typeof args[0] === 'string')
      ? [...this.iterate(args[0])]
      : args;
    if (values.length === 0) throw new PyError('min() arg is an empty sequence', 'ValueError');
    let best = values[0];
    for (const value of values) {
      const comparison = this.compare(value, best);
      if (wantMin ? comparison < 0 : comparison > 0) best = value;
    }
    return best;
  }

  lengthOf(value) {
    if (typeof value === 'string') return [...value].length;
    if (Array.isArray(value)) return value.length;
    if (value instanceof Map) return value.size;
    if (value instanceof Set) return value.size;
    throw new PyError(`object of type '${this.typeName(value)}' has no len()`, 'TypeError');
  }

  openFile(name, mode) {
    const content = '';
    void name;
    void mode;
    return {
      read: () => content,
      write: () => null,
      close: () => null,
      readlines: () => [],
    };
  }

  truthy(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') return value.length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (value instanceof Map || value instanceof Set) return value.size > 0;
    return true;
  }

  compare(left, right) {
    if (typeof left === 'number' && typeof right === 'number') return left - right;
    const a = this.toStr(left);
    const b = this.toStr(right);
    return a < b ? -1 : a > b ? 1 : 0;
  }

  typeName(value) {
    if (value === null || value === undefined) return 'NoneType';
    if (typeof value === 'boolean') return 'bool';
    if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'float';
    if (typeof value === 'string') return 'str';
    if (Array.isArray(value)) return 'list';
    if (value instanceof Map) return 'dict';
    if (value instanceof Set) return 'set';
    if (value instanceof PyFunction) return 'function';
    if (value instanceof PyBytes) return 'bytes';
    return 'object';
  }

  toStr(value) {
    if (value === null || value === undefined) return 'None';
    if (typeof value === 'string') return value;
    if (typeof value === 'boolean') return value ? 'True' : 'False';
    if (typeof value === 'number') return String(value);
    if (Array.isArray(value)) return `[${value.map((item) => this.repr(item)).join(', ')}]`;
    if (value instanceof Map) {
      return `{${[...value.entries()].map(([key, item]) => `${this.repr(key)}: ${this.repr(item)}`).join(', ')}}`;
    }
    if (value instanceof Set) {
      return `{${[...value].map((item) => this.repr(item)).join(', ')}}`;
    }
    if (value instanceof PyBytes) return `b'${value.buffer.toString('latin1')}'`;
    return String(value);
  }

  repr(value) {
    if (typeof value === 'string') {
      if (value.includes("'") && !value.includes('"')) return `"${value}"`;
      return `'${value.replace(/'/g, "\\'")}'`;
    }
    return this.toStr(value);
  }

  toPlain(value) {
    if (Array.isArray(value)) return value.map((item) => this.toPlain(item));
    if (value instanceof Map) {
      return Object.fromEntries([...value.entries()].map(([key, item]) => [key, this.toPlain(item)]));
    }
    return value;
  }

  formatValue(value, spec) {
    const text = String(spec ?? '');
    const match = /^(.)(\d*)([sfdx%]?)$/.exec(text);
    if (!match) return this.toStr(value);
    const [, fill, widthText, kind] = match;
    const width = Number(widthText || 0);
    let body = this.toStr(value);
    if (kind === 'd') body = String(Math.trunc(Number(value)));
    if (kind === 'x') body = (Number(value) >>> 0).toString(16);
    if (kind === 'f') body = String(Number(value));
    if (kind === '%') body = `${(Number(value) * 100).toFixed(2)}%`;
    if (body.length >= width) return body;
    const padding = fill.repeat(width - body.length);
    if (fill === '0' && kind) return padding + body;
    return padding + body;
  }

  iterate(value) {
    if (typeof value === 'string') return [...value];
    if (Array.isArray(value)) return value;
    if (value instanceof Map) return [...value.keys()];
    if (value instanceof Set) return [...value];
    if (value && typeof value === 'object' && typeof value[Symbol.iterator] === 'function') {
      return [...value];
    }
    throw new PyError(`'${this.typeName(value)}' object is not iterable`, 'TypeError');
  }

  /* ------------------------------------------------------------- execution */

  executeBlock(statements, scope) {
    for (const statement of statements) {
      const result = this.execute(statement, scope);
      if (result instanceof PyReturn) return result;
      if (result instanceof PyBreak || result instanceof PyContinue) return result;
    }
    return undefined;
  }

  execute(statement, scope) {
    switch (statement.type) {
      case 'expression':
        this.eval(statement.value, scope);
        return undefined;
      case 'assign':
        this.executeAssign(statement, scope);
        return undefined;
      case 'if': {
        if (this.truthy(this.eval(statement.test, scope))) {
          return this.executeBlock(statement.body, new Scope(scope));
        }
        if (statement.orelse.length > 0) {
          return this.executeBlock(statement.orelse, new Scope(scope));
        }
        return undefined;
      }
      case 'while': {
        while (this.truthy(this.eval(statement.test, scope))) {
          const result = this.executeBlock(statement.body, new Scope(scope));
          if (result instanceof PyBreak) break;
          if (result instanceof PyReturn) return result;
        }
        return undefined;
      }
      case 'for': {
        const iterable = this.eval(statement.iterable, scope);
        for (const item of this.iterate(iterable)) {
          this.assignTarget(statement.target, item, scope);
          const result = this.executeBlock(statement.body, new Scope(scope));
          if (result instanceof PyBreak) break;
          if (result instanceof PyReturn) return result;
        }
        return undefined;
      }
      case 'function': {
        scope.set(statement.name, new PyFunction(statement.name, statement.params, statement.body, scope));
        return undefined;
      }
      case 'return':
        return new PyReturn(statement.value ? this.eval(statement.value, scope) : null);
      case 'break':
        return new PyBreak();
      case 'continue':
        return new PyContinue();
      case 'pass':
        return undefined;
      case 'raise':
        throw new PyError(statement.error ? this.toStr(this.eval(statement.error, scope)) : 'Exception raised', 'Exception');
      case 'assert': {
        if (!this.truthy(this.eval(statement.test, scope))) {
          throw new PyError(statement.message ? this.toStr(this.eval(statement.message, scope)) : 'AssertionError', 'AssertionError');
        }
        return undefined;
      }
      case 'del': {
        for (const target of statement.targets) {
          if (target.type === 'name') scope.variables.delete(target.name);
          else if (target.type === 'subscript') {
            const container = this.eval(target.value, scope);
            const index = this.eval(target.index, scope);
            if (Array.isArray(container)) container.splice(index, 1);
            else if (container instanceof Map) container.delete(index);
          }
        }
        return undefined;
      }
      case 'global':
        return undefined;
      case 'import': {
        const module = scope.get(statement.module);
        if (statement.from) {
          for (const name of statement.names) {
            scope.set(name, module instanceof Map ? module.get(name) : undefined);
          }
        } else {
          scope.set(statement.alias ?? statement.module, module);
        }
        return undefined;
      }
      case 'try': {
        try {
          const result = this.executeBlock(statement.body, new Scope(scope));
          if (result instanceof PyReturn || result instanceof PyBreak || result instanceof PyContinue) return result;
        } catch (error) {
          if (error instanceof PyError && statement.handler) {
            const handlerScope = new Scope(scope);
            if (statement.handler.name) handlerScope.set(statement.handler.name, error.message);
            const result = this.executeBlock(statement.handler.body, handlerScope);
            if (result instanceof PyReturn) return result;
          } else {
            throw error;
          }
        } finally {
          if (statement.finalBody.length > 0) {
            this.executeBlock(statement.finalBody, new Scope(scope));
          }
        }
        return undefined;
      }
      case 'with': {
        for (const item of statement.items) {
          const value = this.eval(item.value, scope);
          if (item.alias) scope.set(item.alias, value);
        }
        return this.executeBlock(statement.body, new Scope(scope));
      }
      default:
        return undefined;
    }
  }

  executeAssign(statement, scope) {
    const value = this.eval(statement.value, scope);
    if (statement.operator === '=') {
      this.assignTarget(statement.target, value, scope);
      return;
    }
    const operator = statement.operator.slice(0, -1);
    const current = this.eval(statement.target, scope);
    const result = this.binaryOperation(operator, current, value);
    this.assignTarget(statement.target, result, scope);
  }

  assignTarget(target, value, scope) {
    if (target.type === 'name') {
      scope.assign(target.name, value);
      return;
    }
    if (target.type === 'tuple' || target.type === 'list') {
      const items = [...this.iterate(value)];
      target.elements.forEach((element, index) => {
        this.assignTarget(element, items[index], scope);
      });
      return;
    }
    if (target.type === 'subscript') {
      const container = this.eval(target.value, scope);
      const index = this.eval(target.index, scope);
      if (Array.isArray(container)) {
        container[index] = value;
        return;
      }
      if (container instanceof Map) {
        container.set(index, value);
        return;
      }
      throw new PyError(`'${this.typeName(container)}' object does not support item assignment`, 'TypeError');
    }
    if (target.type === 'attribute') {
      const container = this.eval(target.value, scope);
      if (container && typeof container === 'object') container[target.attribute] = value;
    }
  }

  eval(node, scope, context = {}) {
    switch (node.type) {
      case 'literal':
        return node.value;
      case 'name': {
        if (context?.a !== undefined && node.name === 'a') return context.a;
        if (context?.b !== undefined && node.name === 'b') return context.b;
        if (node.name === '__name__') return '__main__';
        if (node.name === '__file__') return '<stdin>';
        return scope.get(node.name);
      }
      case 'tuple':
        return node.elements.map((element) => this.eval(element, scope));
      case 'list':
        return node.elements.map((element) => this.eval(element, scope));
      case 'dict': {
        const map = new Map();
        for (const [keyNode, valueNode] of node.entries) {
          map.set(this.eval(keyNode, scope), this.eval(valueNode, scope));
        }
        return map;
      }
      case 'binary': {
        const left = this.eval(node.left, scope);
        const right = this.eval(node.right, scope);
        return this.binaryOperation(node.operator, left, right);
      }
      case 'unary':
        return -Number(this.eval(node.value, scope));
      case 'not':
        return !this.truthy(this.eval(node.value, scope));
      case 'and': {
        const left = this.eval(node.left, scope);
        return this.truthy(left) ? this.eval(node.right, scope) : left;
      }
      case 'or': {
        const left = this.eval(node.left, scope);
        return this.truthy(left) ? left : this.eval(node.right, scope);
      }
      case 'compare': {
        const left = this.eval(node.left, scope);
        const right = this.eval(node.right, scope);
        switch (node.operator) {
          case '==': return this.looseEquals(left, right);
          case '!=': return !this.looseEquals(left, right);
          case '<': return this.compare(left, right) < 0;
          case '>': return this.compare(left, right) > 0;
          case '<=': return this.compare(left, right) <= 0;
          case '>=': return this.compare(left, right) >= 0;
          case 'is': return left === right;
          case 'in': return this.contains(right, left);
          case 'not in': return !this.contains(right, left);
          default: return false;
        }
      }
      case 'ternary':
        return this.truthy(this.eval(node.test, scope))
          ? this.eval(node.value, scope)
          : this.eval(node.alternative, scope);
      case 'subscript': {
        const container = this.eval(node.value, scope);
        const index = this.eval(node.index, scope);
        if (typeof container === 'string') return container[index];
        if (Array.isArray(container)) {
          const position = index < 0 ? container.length + index : index;
          if (position >= container.length || position < 0) throw new PyError('list index out of range', 'IndexError');
          return container[position];
        }
        if (container instanceof Map) {
          if (!container.has(index)) throw new PyError('key not found', 'KeyError');
          return container.get(index);
        }
        throw new PyError(`'${this.typeName(container)}' object is not subscriptable`, 'TypeError');
      }
      case 'attribute':
        return this.getAttribute(this.eval(node.value, scope), node.attribute);
      case 'call':
        return this.call(node, scope);
      case 'lambda': {
        return new PyFunction('<lambda>', node.params.map((name) => ({ name, default: null })), [{ type: 'return', value: node.body }], scope);
      }
      default:
        return null;
    }
  }

  looseEquals(left, right) {
    if (left === right) return true;
    if (typeof left === 'boolean' || typeof right === 'boolean') return this.truthy(left) === this.truthy(right);
    if (typeof left === 'number' && typeof right === 'number') return left === right;
    if (typeof left === 'string' && typeof right === 'string') return left === right;
    return false;
  }

  contains(container, value) {
    if (typeof container === 'string') return container.includes(this.toStr(value));
    if (Array.isArray(container)) return container.some((item) => this.looseEquals(item, value));
    if (container instanceof Map) return container.has(value);
    if (container instanceof Set) return [...container].some((item) => this.looseEquals(item, value));
    return false;
  }

  binaryOperation(operator, left, right) {
    switch (operator) {
      case '+': {
        if (typeof left === 'string' || typeof right === 'string') return this.toStr(left) + this.toStr(right);
        if (Array.isArray(left) && Array.isArray(right)) return [...left, ...right];
        return Number(left) + Number(right);
      }
      case '-': return Number(left) - Number(right);
      case '*': {
        if (typeof left === 'string' && typeof right === 'number') return left.repeat(right);
        if (typeof right === 'string' && typeof left === 'number') return right.repeat(left);
        if (Array.isArray(left) && typeof right === 'number') {
          const result = [];
          for (let index = 0; index < right; index += 1) result.push(...left);
          return result;
        }
        return Number(left) * Number(right);
      }
      case '/': {
        if (Number(right) === 0) throw new PyError('division by zero', 'ZeroDivisionError');
        return Number(left) / Number(right);
      }
      case '//': {
        if (Number(right) === 0) throw new PyError('integer division or modulo by zero', 'ZeroDivisionError');
        return Math.floor(Number(left) / Number(right));
      }
      case '%': {
        if (Number(right) === 0) throw new PyError('integer division or modulo by zero', 'ZeroDivisionError');
        return ((Number(left) % Number(right)) + Number(right)) % Number(right);
      }
      case '**': return Number(left) ** Number(right);
      case '&': return Number(left) & Number(right);
      case '|': return Number(left) | Number(right);
      case '^': return Number(left) ^ Number(right);
      case '<<': return Number(left) << Number(right);
      case '>>': return Number(left) >> Number(right);
      default:
        throw new PyError(`unsupported operator ${operator}`, 'TypeError');
    }
  }

  getAttribute(target, attribute) {
    if (target instanceof PyBytes) {
      if (attribute === 'decode') return (encoding = 'utf-8') => target.decode(encoding);
      if (attribute === 'hex') return () => target.hex();
      if (attribute === 'decode') return (encoding = 'utf-8') => target.decode(encoding);
      return undefined;
    }
    if (target instanceof Map) {
      if (target.has(attribute)) return target.get(attribute);
      if (attribute === 'keys') return () => [...target.keys()];
      if (attribute === 'values') return () => [...target.values()];
      if (attribute === 'items') return () => [...target.entries()];
      if (attribute === 'get') return (key, fallback = null) => (target.has(key) ? target.get(key) : fallback);
      if (attribute === 'update') return (other) => {
        for (const [key, value] of other) target.set(key, value);
        return null;
      };
      if (attribute === 'pop') return (key, fallback = null) => (target.has(key) ? target.delete(key) && target.get(key) : fallback);
      if (attribute === 'setdefault') return (key, fallback = null) => (target.has(key) ? target.get(key) : (target.set(key, fallback), fallback));
      return undefined;
    }
    if (Array.isArray(target)) {
      const methods = {
        append: (value) => { target.push(value); return null; },
        extend: (value) => { target.push(...this.iterate(value)); return null; },
        insert: (index, value) => { target.splice(index, 0, value); return null; },
        pop: (index = -1) => (target.length === 0 ? undefined : target.splice(index, 1)[0]),
        remove: (value) => {
          const position = target.findIndex((item) => this.looseEquals(item, value));
          if (position !== -1) target.splice(position, 1);
          return null;
        },
        index: (value) => target.findIndex((item) => this.looseEquals(item, value)),
        count: (value) => target.filter((item) => this.looseEquals(item, value)).length,
        sort: (comparator) => {
          target.sort((a, b) => {
            if (comparator) return Number(this.callFunction(comparator, [a, b]));
            return this.compare(a, b);
          });
          return null;
        },
        reverse: () => { target.reverse(); return null; },
        copy: () => [...target],
        clear: () => { target.length = 0; return null; },
      };
      if (attribute in methods) return methods[attribute];
      return undefined;
    }
    if (typeof target === 'string') {
      const methods = {
        upper: () => target.toUpperCase(),
        lower: () => target.toLowerCase(),
        title: () => target.replace(/\w\S*/g, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase()),
        capitalize: () => (target.length ? target[0].toUpperCase() + target.slice(1).toLowerCase() : target),
        swapcase: () => [...target].map((char) => (char === char.toUpperCase() ? char.toLowerCase() : char.toUpperCase())).join(''),
        strip: (chars = null) => (chars ? trimChars(target, chars, true, true) : target.trim()),
        lstrip: (chars = null) => (chars ? trimChars(target, chars, true, false) : target.replace(/^\s+/, '')),
        rstrip: (chars = null) => (chars ? trimChars(target, chars, false, true) : target.replace(/\s+$/, '')),
        split: (separator = null, maxSplit = -1) => (separator === null ? target.split(/\s+/) : target.split(separator, maxSplit)),
        rsplit: (separator = null, maxSplit = -1) => (separator === null ? target.split(/\s+/).reverse() : target.split(separator).reverse()),
        splitlines: () => target.split('\n').map((line) => line.replace(/\r$/, '')),
        join: (iterable) => [...this.iterate(iterable)].map((item) => this.toStr(item)).join(target),
        replace: (from, to, count = -1) => target.split(from).join(to),
        find: (needle) => target.indexOf(this.toStr(needle)),
        rfind: (needle) => target.lastIndexOf(this.toStr(needle)),
        index: (needle) => {
          const position = target.indexOf(this.toStr(needle));
          if (position === -1) throw new PyError('substring not found', 'ValueError');
          return position;
        },
        count: (needle) => target.split(this.toStr(needle)).length - 1,
        startswith: (prefix) => target.startsWith(this.toStr(prefix)),
        endswith: (suffix) => target.endsWith(this.toStr(suffix)),
        isalpha: () => /^[A-Za-z]+$/.test(target),
        isdigit: () => /^[0-9]+$/.test(target),
        isnumeric: () => /^[0-9]+$/.test(target),
        isalnum: () => /^[A-Za-z0-9]+$/.test(target),
        isspace: () => /^\s+$/.test(target),
        islower: () => /[a-z]/.test(target) && target === target.toLowerCase(),
        isupper: () => /[A-Z]/.test(target) && target === target.toUpperCase(),
        zfill: (width) => target.padStart(width, '0'),
        ljust: (width, fill = ' ') => target.padEnd(width, fill),
        rjust: (width, fill = ' ') => target.padStart(width, fill),
        center: (width, fill = ' ') => {
          const total = width - target.length;
          const left = Math.floor(total / 2);
          return fill.repeat(Math.max(0, left)) + target + fill.repeat(Math.max(0, total - left));
        },
        encode: () => PyBytes.fromString(target),
        decode: (encoding = 'utf-8') => target,
        format: (...args) => {
          let index = 0;
          return target.replace(/\{([^}]*)\}/g, (match, expression) => {
            const trimmed = expression.trim();
            if (trimmed === '') return this.toStr(args[index++]);
            if (/^\d+$/.test(trimmed)) return this.toStr(args[Number(trimmed)]);
            return match;
          });
        },
        removeprefix: (prefix) => (target.startsWith(this.toStr(prefix)) ? target.slice(this.toStr(prefix).length) : target),
        removesuffix: (suffix) => (target.endsWith(this.toStr(suffix)) ? target.slice(0, -this.toStr(suffix).length) : target),
      };
      if (attribute in methods) return methods[attribute];
      return undefined;
    }
    if (target && typeof target === 'object' && typeof target[attribute] === 'function') {
      return target[attribute].bind(target);
    }
    return undefined;
  }

  call(node, scope) {
    const callee = node.callee;
    let fn = null;
    let args = [];

    if (callee.type === 'name') {
      fn = scope.has(callee.name) ? scope.get(callee.name) : null;
      args = node.args.map((argument) => this.eval(argument, scope));
    } else if (callee.type === 'attribute') {
      const target = this.eval(callee.value, scope);
      fn = this.getAttribute(target, callee.attribute);
      args = node.args.map((argument) => this.eval(argument, scope));
    } else {
      fn = this.eval(callee, scope);
      args = node.args.map((argument) => this.eval(argument, scope));
    }

    if (fn instanceof PyFunction) return this.callFunction(fn, args);
    if (typeof fn === 'function') return fn(...args);
    const name = callee.type === 'attribute' ? callee.attribute : callee.name;
    throw new PyError(`'${name}' object is not callable`, 'TypeError');
  }

  callFunction(fn, args) {
    if (!(fn instanceof PyFunction)) {
      throw new PyError('object is not callable', 'TypeError');
    }
    const scope = new Scope(fn.closure);
    fn.params.forEach((param, index) => {
      if (index < args.length) scope.set(param.name, args[index]);
      else if (param.default) scope.set(param.name, this.eval(param.default, fn.closure));
      else scope.set(param.name, null);
    });
    const result = this.executeBlock(fn.body, scope);
    return result instanceof PyReturn ? result.value : null;
  }
}

function trimChars(text, chars, left, right) {
  const set = new Set([...String(chars)]);
  let start = 0;
  let end = text.length;
  if (left) while (start < end && set.has(text[start])) start += 1;
  if (right) while (end > start && set.has(text[end - 1])) end -= 1;
  return text.slice(start, end);
}

function hashPython(value) {
  let hash = 0;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(index);
    hash |= 0;
  }
  return hash;
}

export { PyError, tokenizePython, Parser, Scope };
