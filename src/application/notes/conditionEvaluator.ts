/**
 * Evaluates the restricted-subset boolean expressions used as conditional edge
 * labels in ZettelFlow canvases. No eval() or Function() — pure parser.
 *
 * Supported syntax:
 *   access-path  ::= 'frontmatter' '.' id | 'note' '.' 'title' | 'canvas' '.' 'name'
 *   literal      ::= '"…"' | '\'…\'' | number | 'true' | 'false' | 'null'
 *   comparison   ::= access-path ('==='|'!==') literal | '(' expr ')'
 *   not-expr     ::= '!' not-expr | comparison
 *   and-expr     ::= not-expr ('&&' not-expr)*
 *   expr         ::= and-expr ('||' and-expr)*
 */

export interface EvalContext {
    frontmatter: Record<string, unknown>;
    noteTitle: string;
    canvasName: string;
}

type TkKind = 'str' | 'num' | 'bool' | 'null' | 'id' | '.' | '===' | '!==' | '&&' | '||' | '!' | '(' | ')';
interface Token { kind: TkKind; value?: unknown; }

function tokenize(input: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    while (i < input.length) {
        if (/\s/.test(input[i])) { i++; continue; }

        // String literals
        if (input[i] === '"' || input[i] === "'") {
            const q = input[i];
            let j = i + 1;
            while (j < input.length && input[j] !== q) j++;
            if (j >= input.length) throw new SyntaxError("Unterminated string");
            tokens.push({ kind: 'str', value: input.slice(i + 1, j) });
            i = j + 1;
            continue;
        }

        // Numbers (optional leading minus only when followed by digit)
        if (/\d/.test(input[i]) || (input[i] === '-' && /\d/.test(input[i + 1] ?? ''))) {
            let j = i;
            if (input[j] === '-') j++;
            while (j < input.length && /[\d.]/.test(input[j])) j++;
            tokens.push({ kind: 'num', value: Number(input.slice(i, j)) });
            i = j;
            continue;
        }

        // Multi-char ops
        const slice3 = input.slice(i, i + 3);
        const slice2 = input.slice(i, i + 2);
        if (slice3 === '===') { tokens.push({ kind: '===' }); i += 3; continue; }
        if (slice3 === '!==') { tokens.push({ kind: '!==' }); i += 3; continue; }
        if (slice2 === '&&') { tokens.push({ kind: '&&' }); i += 2; continue; }
        if (slice2 === '||') { tokens.push({ kind: '||' }); i += 2; continue; }

        // Single-char
        const ch = input[i];
        if (ch === '!') { tokens.push({ kind: '!' }); i++; continue; }
        if (ch === '(') { tokens.push({ kind: '(' }); i++; continue; }
        if (ch === ')') { tokens.push({ kind: ')' }); i++; continue; }
        if (ch === '.') { tokens.push({ kind: '.' }); i++; continue; }

        // Identifiers / keywords
        if (/[a-zA-Z_]/.test(ch)) {
            let j = i;
            while (j < input.length && /[a-zA-Z0-9_]/.test(input[j])) j++;
            const word = input.slice(i, j);
            if (word === 'true') tokens.push({ kind: 'bool', value: true });
            else if (word === 'false') tokens.push({ kind: 'bool', value: false });
            else if (word === 'null') tokens.push({ kind: 'null' });
            else tokens.push({ kind: 'id', value: word });
            i = j;
            continue;
        }

        throw new SyntaxError(`Unexpected character: "${ch}"`);
    }
    return tokens;
}

class Parser {
    private pos = 0;
    constructor(private readonly tokens: Token[], private readonly ctx: EvalContext) {}

    hasMore(): boolean { return this.pos < this.tokens.length; }
    private peek(): Token | undefined { return this.tokens[this.pos]; }
    private consume(): Token {
        const t = this.tokens[this.pos++];
        if (!t) throw new SyntaxError("Unexpected end of expression");
        return t;
    }
    private expect(kind: TkKind): Token {
        const t = this.peek();
        if (t?.kind !== kind) throw new SyntaxError(`Expected ${kind}`);
        return this.consume();
    }

    parseOr(): boolean {
        let left = this.parseAnd();
        while (this.peek()?.kind === '||') {
            this.consume();
            const right = this.parseAnd();
            left = left || right;
        }
        return left;
    }

    private parseAnd(): boolean {
        let left = this.parseNot();
        while (this.peek()?.kind === '&&') {
            this.consume();
            const right = this.parseNot();
            left = left && right;
        }
        return left;
    }

    private parseNot(): boolean {
        if (this.peek()?.kind === '!') {
            this.consume();
            return !this.parseNot();
        }
        return this.parseComparison();
    }

    private parseComparison(): boolean {
        // Grouped expression
        if (this.peek()?.kind === '(') {
            this.consume();
            const result = this.parseOr();
            this.expect(')');
            return result;
        }

        const left = this.parseValue();
        const op = this.peek();
        if (op?.kind !== '===' && op?.kind !== '!==') {
            // Treat a bare access-path as a truthiness check
            return !!left;
        }
        this.consume();
        const right = this.parseValue();
        return op.kind === '===' ? left === right : left !== right;
    }

    private parseValue(): unknown {
        const tk = this.peek();
        if (!tk) throw new SyntaxError("Expected value");
        if (tk.kind === 'str') { this.consume(); return tk.value; }
        if (tk.kind === 'num') { this.consume(); return tk.value; }
        if (tk.kind === 'bool') { this.consume(); return tk.value; }
        if (tk.kind === 'null') { this.consume(); return null; }
        if (tk.kind === 'id') {
            const parts: string[] = [tk.value as string];
            this.consume();
            while (this.peek()?.kind === '.') {
                this.consume();
                const next = this.consume();
                if (next.kind !== 'id') throw new SyntaxError("Expected identifier after '.'");
                parts.push(next.value as string);
            }
            return this.resolvePath(parts);
        }
        throw new SyntaxError(`Unexpected token kind: ${tk.kind}`);
    }

    private resolvePath(parts: string[]): unknown {
        if (parts[0] === 'frontmatter' && parts.length === 2) {
            return this.ctx.frontmatter[parts[1]] ?? null;
        }
        if (parts[0] === 'note' && parts[1] === 'title') return this.ctx.noteTitle;
        if (parts[0] === 'canvas' && parts[1] === 'name') return this.ctx.canvasName;
        return null;
    }
}

/**
 * Evaluate a conditional edge expression. Returns true when the condition
 * passes, false when it doesn't. Throws SyntaxError for malformed expressions.
 */
export function evaluateCondition(expression: string, context: EvalContext): boolean {
    const tokens = tokenize(expression.trim());
    const parser = new Parser(tokens, context);
    const result = parser.parseOr();
    if (parser.hasMore()) throw new SyntaxError("Unexpected token after expression");
    return result;
}

const CONDITION_PREFIX = /^if:\s*/i;

/**
 * If the tooltip is a conditional edge label (`if: <expr>`), return the expression.
 * Otherwise return undefined.
 */
export function parseEdgeCondition(tooltip: string | undefined): string | undefined {
    if (!tooltip) return undefined;
    const match = tooltip.match(CONDITION_PREFIX);
    return match ? tooltip.slice(match[0].length).trim() : undefined;
}
