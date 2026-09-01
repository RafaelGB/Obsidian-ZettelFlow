import { CompletionContext, CompletionResult, Completion } from "@codemirror/autocomplete";
import { javascriptLanguage } from "@codemirror/lang-javascript";
import { hoverTooltip } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { c } from "architecture";
import { describeApi, type ScriptBinding, bindingNames } from "architecture/api";
import { membersOf, resolvePath, withDocs, type ApiMember } from "./introspect";
import { probeFor } from "./probes";

/**
 * The **one** completion engine for every script editor (#351).
 *
 * It replaces three near-identical hand-written providers, each with its own static table of what the
 * API contained: one for `zf`/`app`, one for `note`/`content`/`context`, one for `event`. They drifted
 * — the `zf` table still listed two vault functions after #350 added the whole knowledge surface, and
 * a comment in it conceded that user scripts could never be listed. Completions now come from the
 * **live object the script will receive**, so they cannot describe something that is not there.
 *
 * Which roots exist is the binding contract from #349, so an editor offers exactly what its surface
 * injects — the same constant the settings reader and the runtime read.
 */

/** Documented signatures/summaries from the API manifest, keyed by dotted path. */
function manifest(): Map<string, { signature: string; summary: string }> {
    return new Map(describeApi().map((doc) => [doc.path, { signature: doc.signature, summary: doc.summary }]));
}

/** The dotted path being typed, split into the resolved prefix and the partial word after it. */
export function pathAtCursor(context: CompletionContext): { segments: string[]; partial: string; from: number } | null {
    const line = context.state.doc.lineAt(context.pos);
    const text = line.text.slice(0, context.pos - line.from);

    // Not inside a comment or an unterminated string.
    if (/\/\/.*$/.test(text)) return null;
    if ((text.match(/"/g)?.length ?? 0) % 2 === 1) return null;
    if ((text.match(/'/g)?.length ?? 0) % 2 === 1) return null;

    const match = text.match(/(\w+(?:\.\w+)*\.?)$/);
    if (!match) return null;

    const parts = match[1].split(".");
    const partial = match[1].endsWith(".") ? "" : (parts.pop() ?? "");
    const segments = parts.filter(Boolean);
    if (segments.length === 0) return null;

    return { segments, partial, from: context.pos - partial.length };
}

function toCompletion(member: ApiMember): Completion {
    return {
        label: member.name,
        type: member.kind === "function" ? "method" : "property",
        detail: member.signature === member.name ? member.kind : member.signature,
        info: member.summary,
        boost: 99, // above the editor's generic JavaScript suggestions
    };
}

/** Resolve the members offered for a dotted path against the surface's live probes. */
export async function membersAt(
    segments: readonly string[],
    bindings: readonly ScriptBinding[]
): Promise<ApiMember[]> {
    const [root, ...rest] = segments;
    if (!bindingNames(bindings).includes(root)) return [];

    const probe = await probeFor(root);
    if (probe === undefined) return [];

    const target = rest.length === 0 ? probe : resolvePath(probe, rest);
    return withDocs(membersOf(target), segments.join("."), manifest());
}

/** Dot-completion for one scripting surface, derived from what that surface actually injects. */
export function apiCompletion(bindings: readonly ScriptBinding[]): Extension {
    return javascriptLanguage.data.of({
        autocomplete: async (context: CompletionContext): Promise<CompletionResult | null> => {
            const at = pathAtCursor(context);
            if (!at) return null;

            const members = await membersAt(at.segments, bindings);
            if (members.length === 0) return null;

            const matching = at.partial
                ? members.filter((member) => member.name.toLowerCase().startsWith(at.partial.toLowerCase()))
                : members;
            if (matching.length === 0) return null;

            return { from: at.from, options: matching.map(toCompletion), validFor: /^\w*$/ };
        },
    });
}

/**
 * Hover documentation, over the `tooltips()` manager the editor already installed with no source
 * wired. Shows the signature, and the manifest's summary where there is one.
 */
export function apiHover(bindings: readonly ScriptBinding[]): Extension {
    return hoverTooltip(async (view, pos) => {
        const line = view.state.doc.lineAt(pos);
        const offset = pos - line.from;
        const before = line.text.slice(0, offset).match(/[\w.]*$/)?.[0] ?? "";
        const after = line.text.slice(offset).match(/^\w*/)?.[0] ?? "";
        const segments = `${before}${after}`.split(".").filter(Boolean);
        if (segments.length < 2) return null;

        const name = segments[segments.length - 1];
        const members = await membersAt(segments.slice(0, -1), bindings);
        const member = members.find((candidate) => candidate.name === name);
        if (!member) return null;

        return {
            pos: pos - before.length,
            end: pos + after.length,
            above: true,
            create: () => {
                const dom = createDiv({ cls: c("cm-hover") });
                dom.createEl("code", { cls: c("cm-hover-signature"), text: member.signature });
                if (member.summary) dom.createDiv({ cls: c("cm-hover-summary"), text: member.summary });
                return { dom };
            },
        };
    });
}
