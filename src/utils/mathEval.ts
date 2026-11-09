/**
 * Safe, deterministic recursive-descent mathematical evaluator.
 * Supports natural spoken phrasing ("987 multiplied by 654", "square root of 144",
 * "15% of 360", "2 to the power of 10") without ever calling `eval` or `Function`.
 */

export interface MathResult {
  expression: string;
  normalized: string;
  value: number;
  formatted: string;
  steps: string[];
}

export function normalizeMathPhrase(raw: string): string {
  let s = raw
    .toLowerCase()
    .replace(/^jarvis[\s,:-]*/i, '')
    .replace(/^(please\s+)?(calculate|compute|solve|evaluate|what\s+is|what's|whats|how\s+much\s+is)\s+/i, '')
    .replace(/[?=]+$/g, '')
    .trim();

  // Replace comma separators inside numbers (e.g. 1,000 -> 1000)
  s = s.replace(/(\d),(\d{3})\b/g, '$1$2');

  // "X percent of Y" or "X% of Y" -> (X / 100) * Y
  s = s.replace(
    /(\d+(?:\.\d+)?)\s*(?:%|percent|per\s+cent)\s+of\s+(\d+(?:\.\d+)?)/gi,
    '(($1 / 100) * $2)',
  );

  // Spoken functions & operators
  s = s
    .replace(/\bthe\s+square\s+root\s+of\s+/gi, 'sqrt ')
    .replace(/\bsquare\s+root\s+of\s+/gi, 'sqrt ')
    .replace(/\bsqrt\s+of\s+/gi, 'sqrt ')
    .replace(/\bto\s+the\s+power\s+of\s+/gi, ' ^ ')
    .replace(/\braised\s+to\s+/gi, ' ^ ')
    .replace(/\bsquared\b/gi, ' ^ 2')
    .replace(/\bcubed\b/gi, ' ^ 3')
    .replace(/\bmultiplied\s+by\b/gi, ' * ')
    .replace(/\bdivided\s+by\b/gi, ' / ')
    .replace(/\bmodulo\b|\bmod\b/gi, ' % ')
    .replace(/\btimes\b/gi, ' * ')
    .replace(/\bplus\b/gi, ' + ')
    .replace(/\bminus\b/gi, ' - ')
    .replace(/\bover\b/gi, ' / ')
    .replace(/[×✕]/g, ' * ')
    .replace(/[÷]/g, ' / ')
    .replace(/[−–]/g, ' - ')
    // "987 x 654" where x is between numbers
    .replace(/(\d)\s*x\s*(\d)/gi, '$1 * $2')
    .replace(/\bpi\b|π/gi, String(Math.PI));

  return s.replace(/\s+/g, ' ').trim();
}

type Token =
  | { type: 'num'; value: number }
  | { type: 'op'; value: '+' | '-' | '*' | '/' | '^' | '%' }
  | { type: 'fn'; value: 'sqrt' | 'sin' | 'cos' | 'tan' | 'log' | 'abs' }
  | { type: 'paren'; value: '(' | ')' };

function tokenize(expr: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/\d|\./.test(ch)) {
      let numStr = '';
      while (i < expr.length && /[\d.]/.test(expr[i])) {
        numStr += expr[i++];
      }
      const value = Number.parseFloat(numStr);
      if (!Number.isFinite(value)) return null;
      tokens.push({ type: 'num', value });
      continue;
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '^' || ch === '%') {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }
    if (ch === '(' || ch === ')') {
      tokens.push({ type: 'paren', value: ch });
      i++;
      continue;
    }
    if (/[a-z]/i.test(ch)) {
      let word = '';
      while (i < expr.length && /[a-z]/i.test(expr[i])) {
        word += expr[i++];
      }
      const fn = word.toLowerCase();
      if (fn === 'sqrt' || fn === 'sin' || fn === 'cos' || fn === 'tan' || fn === 'log' || fn === 'abs') {
        tokens.push({ type: 'fn', value: fn });
        continue;
      }
      return null;
    }
    return null;
  }
  return tokens;
}

export function tryEvaluateMath(rawInput: string): MathResult | null {
  const normalized = normalizeMathPhrase(rawInput);
  if (!normalized || !/\d/.test(normalized)) return null;
  // Require either an operator, a math function, or an explicit "calculate/compute" prefix
  const hasExplicitTrigger = /\b(calculate|compute|solve|evaluate)\b/i.test(rawInput);
  const hasOperatorOrFn = /[+\-*/^%]|\b(sqrt|sin|cos|tan|log|abs)\b/.test(normalized);
  if (!hasExplicitTrigger && !hasOperatorOrFn) return null;

  const tokens = tokenize(normalized);
  if (!tokens || tokens.length === 0) return null;

  let pos = 0;
  const steps: string[] = [];

  const fmt = (n: number): string => {
    if (!Number.isFinite(n)) return String(n);
    const rounded = Math.abs(n - Math.round(n)) < 1e-10 ? Math.round(n) : Number(n.toPrecision(12));
    return rounded.toLocaleString('en-IN', { maximumFractionDigits: 8 });
  };

  function parseExpression(): number {
    let left = parseTerm();
    while (pos < tokens!.length) {
      const t = tokens![pos];
      if (t.type === 'op' && (t.value === '+' || t.value === '-')) {
        pos++;
        const right = parseTerm();
        const prev = left;
        left = t.value === '+' ? left + right : left - right;
        steps.push(`${fmt(prev)} ${t.value} ${fmt(right)} = ${fmt(left)}`);
      } else {
        break;
      }
    }
    return left;
  }

  function parseTerm(): number {
    let left = parsePower();
    while (pos < tokens!.length) {
      const t = tokens![pos];
      if (t.type === 'op' && (t.value === '*' || t.value === '/' || t.value === '%')) {
        pos++;
        const right = parsePower();
        if ((t.value === '/' || t.value === '%') && right === 0) {
          throw new Error('Division by zero');
        }
        const prev = left;
        left = t.value === '*' ? left * right : t.value === '/' ? left / right : left % right;
        const sym = t.value === '*' ? '×' : t.value === '/' ? '÷' : 'mod';
        steps.push(`${fmt(prev)} ${sym} ${fmt(right)} = ${fmt(left)}`);
      } else {
        break;
      }
    }
    return left;
  }

  function parsePower(): number {
    const base = parseUnary();
    if (pos < tokens!.length) {
      const t = tokens![pos];
      if (t.type === 'op' && t.value === '^') {
        pos++;
        const exp = parsePower();
        const res = Math.pow(base, exp);
        steps.push(`${fmt(base)} ^ ${fmt(exp)} = ${fmt(res)}`);
        return res;
      }
    }
    return base;
  }

  function parseUnary(): number {
    if (pos >= tokens!.length) throw new Error('Unexpected end');
    const t = tokens![pos];
    if (t.type === 'op' && (t.value === '+' || t.value === '-')) {
      pos++;
      const v = parseUnary();
      return t.value === '-' ? -v : v;
    }
    if (t.type === 'fn') {
      pos++;
      const arg = parseUnary();
      let res = 0;
      switch (t.value) {
        case 'sqrt':
          if (arg < 0) throw new Error('Square root of negative number');
          res = Math.sqrt(arg);
          steps.push(`√${fmt(arg)} = ${fmt(res)}`);
          break;
        case 'sin':
          res = Math.sin((arg * Math.PI) / 180);
          steps.push(`sin(${fmt(arg)}°) = ${fmt(res)}`);
          break;
        case 'cos':
          res = Math.cos((arg * Math.PI) / 180);
          steps.push(`cos(${fmt(arg)}°) = ${fmt(res)}`);
          break;
        case 'tan':
          res = Math.tan((arg * Math.PI) / 180);
          steps.push(`tan(${fmt(arg)}°) = ${fmt(res)}`);
          break;
        case 'log':
          res = Math.log10(arg);
          steps.push(`log₁₀(${fmt(arg)}) = ${fmt(res)}`);
          break;
        case 'abs':
          res = Math.abs(arg);
          steps.push(`|${fmt(arg)}| = ${fmt(res)}`);
          break;
      }
      return res;
    }
    return parsePrimary();
  }

  function parsePrimary(): number {
    if (pos >= tokens!.length) throw new Error('Unexpected end');
    const t = tokens![pos];
    if (t.type === 'num') {
      pos++;
      return t.value;
    }
    if (t.type === 'paren' && t.value === '(') {
      pos++;
      const val = parseExpression();
      const close = tokens![pos];
      if (!close || close.type !== 'paren' || close.value !== ')') {
        throw new Error('Mismatched parentheses');
      }
      pos++;
      return val;
    }
    throw new Error('Unexpected token');
  }

  try {
    const value = parseExpression();
    if (pos !== tokens.length || !Number.isFinite(value)) return null;
    const formatted = fmt(value);
    return {
      expression: rawInput.trim(),
      normalized,
      value,
      formatted,
      steps,
    };
  } catch {
    return null;
  }
}
