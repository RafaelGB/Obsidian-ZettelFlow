import { describe, it, expect } from "@jest/globals";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join, relative, sep } from "path";
import EN from "architecture/lang/locale/en";

// test/docs → 2 ups → repo root
const ROOT = join(__dirname, "..", "..");
const DOCS = join(ROOT, "docs");
const CRLF = new RegExp(String.fromCharCode(13) + String.fromCharCode(10), "g");
const read = (path: string) => readFileSync(path, "utf8").replace(CRLF, "\n");
const LOCALE = EN as Record<string, string>;

/**
 * **The docs describe the Community view that ships** (#804, epic #797).
 *
 * Community stopped being a modal with tabs in #798: it is one view with four rooms. A page that
 * still sends a reader to the *Community templates* browser, a *Browse tab* or a *Manage installed
 * templates* modal sends them somewhere that no longer exists — and the Learn tutorials are written
 * from these pages.
 */

/** History, not instructions: the roadmap, release notes and the #231 friction audit. */
const EXEMPT = [/development[\\/]project-health-and-roadmap\.md$/, /development[\\/]friction-audit\.md$/, /release/i];

const STALE: [label: string, re: RegExp][] = [
    ["the Community templates browser", /Community [Tt]emplates/],
    ["the community browser", /\bcommunity (templates )?browser\b/i],
    ["the Hub", /\bthe Hub\b/],
    ["a Browse tab", /\bBrowse tab\b/],
    ["a Systems tab", /\bSystems\*{0,2} tab\b/],
    ["the Manage installed templates modal", /Manage installed templates[^.\n]{0,40}\bmodal\b/i],
    ["a deleted modal class", /\b(CommunityTemplatesModal|CommunitySystemModal|ManageInstalledTemplatesModal)\b/],
    ["the old install button", /\*\*Install system\*\*/],
];

/** The subtraction ledger names what #797 deleted, on purpose: it is the one place allowed to. */
const LEDGER = /^## The subtraction ledger[^\n]*\n[\s\S]*?(?=^## |(?![\s\S]))/m;

function markdownFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) return markdownFiles(full);
        return entry.endsWith(".md") ? [full] : [];
    });
}

const PAGES = markdownFiles(DOCS).filter((file) => !EXEMPT.some((re) => re.test(file)));
const USER_PAGE = join(DOCS, "community", "index.md");
const TUTORIAL_PAGE = join(DOCS, "how-to-contribute", "adding-a-tutorial.md");

/** The en label of a key, with `{0}` read as *n* — how a page writes a counted label. */
const label = (key: string): string => {
    const text = LOCALE[key];
    if (!text) throw new Error(`no en string for ${key}`);
    return text.replace("{0}", "n");
};

describe("no page sends a reader to the Community that was (#804 AC-4, FR-7)", () => {
    it("reads a docs tree worth checking", () => {
        expect(PAGES.length).toBeGreaterThan(100);
    });

    it("finds the ledger it strips in community.md", () => {
        expect(read(join(DOCS, "architecture", "community.md"))).toMatch(LEDGER);
    });

    it("names no modal, tab or browser that #797 removed", () => {
        const hits: string[] = [];
        for (const file of PAGES) {
            const text = read(file).replace(LEDGER, "");
            text.split("\n").forEach((line, index) => {
                for (const [what, re] of STALE) {
                    if (re.test(line)) hits.push(`${relative(DOCS, file).split(sep).join("/")}:${index + 1} ${what}`);
                }
            });
        }
        expect(hits).toEqual([]);
    });
});

describe("the Community page is the reader's (#804 FR-1)", () => {
    const page = existsSync(USER_PAGE) ? read(USER_PAGE) : "";

    it("exists", () => {
        expect(existsSync(USER_PAGE)).toBe(true);
    });

    it.each(["community_room_learn", "community_room_systems", "community_room_contribute", "community_room_installed"])(
        "gives the %s room its own section",
        (key) => {
            expect(page).toMatch(new RegExp(`^## ${LOCALE[key]}\\b`, "m"));
        }
    );

    it.each([
        "community_contribute_share_title",
        "community_contribute_share_button",
        "community_contribute_idea_title",
        "community_contribute_bug_title",
        "community_contribute_discuss_title",
        "community_contribute_well_title",
        "community_installed_systems",
        "community_installed_pieces",
        "community_installed_open_canvas",
        "community_installed_remove",
        "community_installed_remove_confirm",
        "community_installed_forget",
        "community_installed_from_clipboard",
        "community_walk_title",
        "community_use_title",
        "community_install",
        "community_systems_in_vault",
        "community_create_a_note",
        "changes_undo",
        "learn_search",
        "learn_mark_done",
        "learn_up_next",
        "learn_new",
        "learn_progress_note",
    ])("uses the label the UI shows: %s", (key) => {
        expect({ key, named: page.includes(`*${label(key)}*`) }).toEqual({ key, named: true });
    });

    it("says what Undo and Remove take back, and what they keep", () => {
        expect(page).toMatch(/^## Undo and Remove/m);
        expect(page).toContain("trash");
        expect(page).toMatch(/kept, and named/i);
    });

    it("says where the progress and the copy of the catalog are kept", () => {
        expect(page).toContain("data.json");
        expect(page).toContain("local storage");
    });
});

describe("adding a tutorial is written down (#804 FR-2)", () => {
    const page = existsSync(TUTORIAL_PAGE) ? read(TUTORIAL_PAGE) : "";

    it("exists", () => {
        expect(existsSync(TUTORIAL_PAGE)).toBe(true);
    });

    it("names the file and points at the catalog's architecture section", () => {
        expect(page).toContain("docs/learn/catalog.json");
        expect(page).toContain("../architecture/community.md#the-learn-catalog-801");
    });

    it("makes `since` the first rule", () => {
        const first = page.split("\n").find((line) => /^1\. /.test(line)) ?? "";
        expect(first).toContain("`since`");
        expect(first).toContain("manifest.json");
    });

    it.each([
        ["3–6 steps", /3–6 steps/],
        ["en and es", /`en`[^.\n]*`es`/],
        ["images exist", /docs\/resources\//],
        ["pages exist", /`doc`/],
        ["capability ids", /CAPABILITIES/],
        ["the coverage ratchet", /UNCOVERED/],
        ["the coverage test", /learnCoverage/],
        ["the deep link", /openCommunity\(app, "learn", \{ tutorial: /],
        ["no release needed", /reaches every user on their next visit/],
        ["how to check it locally", /npx jest test\/docs\/learnCatalog test\/docs\/learnCoverage/],
    ])("covers %s", (_what, re) => {
        expect(page).toMatch(re);
    });
});
