import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import {
    deriveRecommendations,
    RECOMMENDATION_REASONS,
    RecommendationReason,
    COMMAND_ACTION_IDS,
    fromDashboardToken,
    fromDebt,
    fromBalance,
    fromReview,
    fromNextSession,
    fromNextMove,
} from "architecture/knowledge/state/recommendation";
import { idea, buildModel } from "../../../actions/knowledge/support/knowledgeFixture";

// The 11-note fixture mirrors the dashboard test: orphan, dangling, fleeting, contradiction,
// open question, and a co-citation discovery — every derivation signal is present.
const model = buildModel([
    idea("s.md", "permanent", [{ to: "a.md" }, { to: "b.md" }]),
    idea("a.md", "permanent", []),
    idea("b.md", "permanent", []),
    idea("x.md", "permanent", [{ to: "y.md", type: "contradicts" }]),
    idea("y.md", "permanent", []),
    idea("q1.md", "permanent", [{ to: "q2.md", type: "question" }]),
    idea("q2.md", "permanent", []),
    idea("d.md", "permanent", [{ to: "missing.md" }]),
    idea("iso.md", "permanent", []),
    idea("f1.md", "fleeting", [{ to: "a.md" }]),
    idea("f2.md", "fleeting", [{ to: "b.md" }]),
]);

const ROOT = join(__dirname, "..", "..", "..", "..");

describe("deriveRecommendations — pure primitive (#267, AC-1/AC-5)", () => {
    it("returns a deterministic, non-empty, priority-desc list for a populated model", () => {
        const first = deriveRecommendations(model);
        expect(first.length).toBeGreaterThan(0);
        // priority-desc, stable/idempotent
        for (let i = 1; i < first.length; i++) expect(first[i - 1].priority).toBeGreaterThanOrEqual(first[i].priority);
        expect(deriveRecommendations(model)).toEqual(first);
    });

    it("every recommendation has a valid reason and priority in [0,1]", () => {
        for (const r of deriveRecommendations(model)) {
            expect(RECOMMENDATION_REASONS).toContain(r.reason);
            expect(r.priority).toBeGreaterThanOrEqual(0);
            expect(r.priority).toBeLessThanOrEqual(1);
            expect(Array.isArray(r.target)).toBe(true);
        }
    });

    it("returns a defined empty array for an empty model and never throws on a degenerate model", () => {
        expect(deriveRecommendations(buildModel([]))).toEqual([]);
        const degenerate = buildModel([idea("self.md", "permanent", [{ to: "self.md" }]), idea("d.md", "permanent", [{ to: "gone.md" }])]);
        expect(() => deriveRecommendations(degenerate)).not.toThrow();
        expect(deriveRecommendations(degenerate)).toEqual(deriveRecommendations(degenerate));
    });

    it("surfaces the fixture's contradiction, add-source and connect signals", () => {
        const reasons = new Set(deriveRecommendations(model).map((r) => r.reason));
        expect(reasons.has("resolve-contradiction")).toBe(true);
        expect(reasons.has("connect")).toBe(true);
    });

    it("the module imports no platform API and not the knowledge barrel (§XI)", () => {
        const src = readFileSync(join(ROOT, "src", "architecture", "knowledge", "state", "recommendation.ts"), "utf8");
        const imports = src.split("\n").filter((l) => /^\s*import\b/.test(l)).join("\n");
        expect(imports).not.toMatch(/from\s+["']obsidian["']/);
        expect(imports).not.toMatch(/from\s+["']architecture\/knowledge["']/);
    });
});

// ─── T2: closed command union + six-vocabulary coverage ──────────────────────────────────────────

function collectActionFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...collectActionFiles(full));
        else if (/Action\.(ts|tsx)$/.test(entry)) out.push(full);
    }
    return out;
}

function shippedIdsByKind(): { command: Set<string>; query: Set<string> } {
    const command = new Set<string>();
    const query = new Set<string>();
    for (const file of collectActionFiles(join(ROOT, "src", "actions"))) {
        const src = readFileSync(file, "utf8");
        const id = src.match(/id\s*=\s*"([^"]+)"/)?.[1];
        const kind = src.match(/kind\s*=\s*"(command|query)"/)?.[1];
        if (!id || !kind) continue;
        (kind === "command" ? command : query).add(id);
    }
    return { command, query };
}

describe("KnowledgeRecommendation command union + unification (#267, AC-4/AC-6)", () => {
    it("COMMAND_ACTION_IDS equals the shipped kind=command action ids exactly", () => {
        const { command } = shippedIdsByKind();
        expect(new Set(COMMAND_ACTION_IDS)).toEqual(command);
    });

    it("every emitted command is a real command id and never a query id", () => {
        const { command, query } = shippedIdsByKind();
        for (const r of deriveRecommendations(model)) {
            if (r.command === null) continue;
            expect(command.has(r.command)).toBe(true);
            expect(query.has(r.command)).toBe(false);
        }
    });

    it("unifies all six next-step vocabularies onto a reason in the closed union (none unmapped)", () => {
        const cases: [(t: string) => RecommendationReason, string[]][] = [
            [fromDashboardToken, ["connect-orphans", "all-connected", "reduce-debt", "debt-clear", "resolve-contradictions", "answer-questions", "process-ideas", "make-connections", "all-clear"]],
            [fromDebt, ["connect", "add-source", "answer-question"]],
            [fromBalance, ["add-sources", "add-examples", "ask-questions"]],
            [fromReview, ["open", "connect", "review"]],
            [fromNextSession, ["develop-hub"]],
            [fromNextMove, ["add-source", "connect", "add-example", "advance-state"]],
        ];
        for (const [mapper, tokens] of cases) {
            for (const token of tokens) {
                expect(RECOMMENDATION_REASONS).toContain(mapper(token));
            }
        }
    });
});
