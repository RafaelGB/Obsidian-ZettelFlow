/**
 * **A Prism shaped like Obsidian's** (#824) — for jest, which has no Prism of its own.
 *
 * Obsidian ships Prism 1.30.0 and hands it out through `loadPrism()`. What the Reader relies on is its
 * shape, not its grammars: `Prism.languages[id]` is an object for a language it knows, and
 * `Prism.tokenize(text, grammar)` returns strings and `Token`s (`type`, `content` that is a string, a
 * Token or an array of both, an optional `alias`). This keeps exactly that shape with three small
 * grammars — enough for keywords, strings, comments (one spanning lines) and a nested token.
 *
 * Which languages the real Prism knows is a fixture taken from the app (`test/fixtures/prismLanguages.json`).
 */

export class Token {
    constructor(
        public type: string,
        public content: string | Token | (string | Token)[],
        public alias?: string | string[]
    ) {}
}

type Grammar = { pattern: RegExp; type: string; alias?: string; inside?: Grammar[] }[];

const keywords = (words: string[]) => new RegExp(`\\b(?:${words.join("|")})\\b`, "y");

const GRAMMARS: Record<string, Grammar> = {
    python: [
        { pattern: /#[^\n]*/y, type: "comment" },
        { pattern: /"""[\s\S]*?"""/y, type: "string", alias: "triple-quoted-string" },
        { pattern: /"[^"\n]*"|'[^'\n]*'/y, type: "string" },
        { pattern: /f"[^"\n]*"/y, type: "string-interpolation", inside: [{ pattern: /\{[^}]*\}/y, type: "interpolation" }] },
        { pattern: keywords(["def", "return", "if", "else", "for", "while", "class", "import", "from", "None", "True", "False", "in", "not"]), type: "keyword" },
        { pattern: /\b\d+\b/y, type: "number" },
        { pattern: /[()[\]{}:,.]/y, type: "punctuation" },
    ],
    rust: [
        { pattern: /\/\*[\s\S]*?\*\//y, type: "comment" },
        { pattern: /\/\/[^\n]*/y, type: "comment" },
        { pattern: /"[^"\n]*"/y, type: "string" },
        { pattern: keywords(["fn", "let", "mut", "pub", "struct", "impl", "return", "match", "use"]), type: "keyword" },
        { pattern: /[()[\]{};:,.]/y, type: "punctuation" },
    ],
    bash: [
        { pattern: /#[^\n]*/y, type: "comment" },
        { pattern: /"[^"\n]*"/y, type: "string" },
        { pattern: keywords(["echo", "export", "if", "then", "fi", "for", "do", "done", "cd"]), type: "builtin", alias: "keyword" },
    ],
};

function run(text: string, grammar: Grammar): (string | Token)[] {
    const out: (string | Token)[] = [];
    let plain = "";
    let at = 0;
    outer: while (at < text.length) {
        for (const rule of grammar) {
            rule.pattern.lastIndex = at;
            const match = rule.pattern.exec(text);
            if (match && match[0].length > 0) {
                if (plain) out.push(plain);
                plain = "";
                const content = rule.inside ? run(match[0], rule.inside) : match[0];
                out.push(new Token(rule.type, Array.isArray(content) && content.length === 1 && typeof content[0] === "string" ? content[0] : content, rule.alias));
                at += match[0].length;
                continue outer;
            }
        }
        plain += text[at++];
    }
    if (plain) out.push(plain);
    return out;
}

export const fakePrism = {
    languages: GRAMMARS as Record<string, unknown>,
    Token,
    tokenize(text: string, grammar: unknown): (string | Token)[] {
        return run(text, grammar as Grammar);
    },
    highlight(): string {
        throw new Error("the Reader never asks Prism for HTML (#824)");
    },
};
