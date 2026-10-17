/**
 * **The languages a book's code is coloured in** (#824) — pure, a closed list.
 *
 * A technical book names the language of a listing in its own way: `data-code-language="python"`
 * (O'Reilly), `class="language-python"`, `class="highlight-py"`, `lang="py"`. The sanitiser keeps none of
 * those attributes (§XV: the book has no look of its own) — only the **one fact** that a listing is
 * written in a language this list knows, as the Prism id Obsidian colours it with. A name off the list,
 * or anything that is not a plain name, is no language at all: the listing is still code, uncoloured.
 *
 * Every id here is a grammar the Prism Obsidian ships knows (`test/fixtures/prismLanguages.json`, taken
 * from the app), so a keyword in a book is the colour of the same keyword in a note — by construction.
 */

/** Each Prism id, and the name a reader knows it by. */
const NAMES: Record<string, string> = {
    bash: "Shell",
    c: "C",
    clojure: "Clojure",
    cpp: "C++",
    csharp: "C#",
    css: "CSS",
    dart: "Dart",
    diff: "Diff",
    docker: "Dockerfile",
    elixir: "Elixir",
    erlang: "Erlang",
    fsharp: "F#",
    go: "Go",
    graphql: "GraphQL",
    groovy: "Groovy",
    haskell: "Haskell",
    ini: "INI",
    java: "Java",
    javascript: "JavaScript",
    json: "JSON",
    julia: "Julia",
    kotlin: "Kotlin",
    latex: "LaTeX",
    lisp: "Lisp",
    lua: "Lua",
    makefile: "Makefile",
    markdown: "Markdown",
    markup: "HTML",
    matlab: "MATLAB",
    nginx: "nginx",
    objectivec: "Objective-C",
    ocaml: "OCaml",
    perl: "Perl",
    php: "PHP",
    powershell: "PowerShell",
    python: "Python",
    r: "R",
    ruby: "Ruby",
    rust: "Rust",
    scala: "Scala",
    scheme: "Scheme",
    sql: "SQL",
    swift: "Swift",
    toml: "TOML",
    typescript: "TypeScript",
    yaml: "YAML",
};

/** What books call those languages, beside their Prism ids. */
const ALIASES: Record<string, string> = {
    sh: "bash",
    shell: "bash",
    zsh: "bash",
    console: "bash",
    "c++": "cpp",
    cxx: "cpp",
    cc: "cpp",
    "c#": "csharp",
    cs: "csharp",
    dockerfile: "docker",
    ex: "elixir",
    exs: "elixir",
    erl: "erlang",
    "f#": "fsharp",
    golang: "go",
    hs: "haskell",
    js: "javascript",
    node: "javascript",
    jsx: "javascript",
    kt: "kotlin",
    tex: "latex",
    md: "markdown",
    html: "markup",
    xml: "markup",
    xhtml: "markup",
    svg: "markup",
    objc: "objectivec",
    "objective-c": "objectivec",
    ml: "ocaml",
    pl: "perl",
    ps1: "powershell",
    py: "python",
    python3: "python",
    py3: "python",
    rb: "ruby",
    rs: "rust",
    scm: "scheme",
    ts: "typescript",
    tsx: "typescript",
    yml: "yaml",
    plsql: "sql",
    mysql: "sql",
    postgresql: "sql",
};

/** Every Prism id the list colours. */
export const CODE_LANGUAGES: readonly string[] = Object.keys(NAMES);

const own = (table: Record<string, string>, key: string): boolean => Object.prototype.hasOwnProperty.call(table, key);

/** A plain language name, as a book writes it: nothing that is not one is looked up at all. */
const NAME = /^[a-z0-9+#.-]{1,24}$/;

/** The Prism id `raw` names, or `null` when it names none on the list. */
export function codeLanguageOf(raw: string | null | undefined): string | null {
    const value = (raw ?? "").trim().toLowerCase();
    if (!NAME.test(value)) return null;
    // Own keys only: `constructor` is on every object, and is no language.
    if (own(NAMES, value)) return value;
    return own(ALIASES, value) ? ALIASES[value] : null;
}

/** The language a class list names — `language-x`, `lang-x`, `highlight-x` — or `null`. */
export function codeLanguageOfClass(classes: string): string | null {
    for (const token of classes.split(/\s+/)) {
        const match = /^(?:language|lang|highlight|brush:)-?(.+)$/i.exec(token);
        const id = match ? codeLanguageOf(match[1]) : null;
        if (id) return id;
    }
    return null;
}

/** The name a reader knows a language by ("Python"); the id itself for one off the list. */
export function codeLanguageName(id: string): string {
    return own(NAMES, id) ? NAMES[id] : id;
}
