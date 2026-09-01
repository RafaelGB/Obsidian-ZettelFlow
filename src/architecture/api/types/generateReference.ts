import type { ApiMemberDoc } from "../lib/LibModule";

/**
 * Generate the `zf` API reference page from the manifest (#352).
 *
 * The reference used to be written by hand, which is why `zf.dashboard()` sat in the docs as a promise
 * for a release and a half, and why three of the examples added in #350 referenced fields that did not
 * exist. The committed page is now produced from the same descriptors the editor completes from, and a
 * test asserts the file on disk matches — so code and docs cannot disagree without failing the build.
 *
 * Pure: descriptors in, markdown out.
 */

/** Marks the generated file so nobody edits it by hand and loses the change on the next build. */
export const GENERATED_HEADER = "<!-- Generated from the API manifest. Run the reference test to regenerate. -->";

/** Human titles for the top-level namespaces, in the order they should be presented. */
const NAMESPACE_TITLES: Record<string, string> = {
    "zf.knowledge": "Knowledge — `zf.knowledge`",
    "zf.ai": "AI — `zf.ai`",
    "zf.internal.vault": "Vault — `zf.internal.vault`",
};

/** Group members by their namespace (everything before the final segment). */
function byNamespace(members: readonly ApiMemberDoc[]): Map<string, ApiMemberDoc[]> {
    const groups = new Map<string, ApiMemberDoc[]>();
    for (const member of members) {
        const namespace = member.path.slice(0, member.path.lastIndexOf("."));
        const bucket = groups.get(namespace) ?? [];
        bucket.push(member);
        groups.set(namespace, bucket);
    }
    return groups;
}

/** Escape a signature for a markdown table cell. */
function cell(text: string): string {
    return text.replace(/\|/g, "\\|");
}

export function generateReference(members: readonly ApiMemberDoc[]): string {
    const groups = byNamespace(members);
    const ordered = [
        ...Object.keys(NAMESPACE_TITLES).filter((namespace) => groups.has(namespace)),
        ...[...groups.keys()].filter((namespace) => !(namespace in NAMESPACE_TITLES)).sort(),
    ];

    const lines: string[] = [
        GENERATED_HEADER,
        "",
        "# `zf` API — generated reference",
        "",
        "Every member of the ZettelFlow script API, generated from the plugin's own manifest. This is the",
        "same description the editor's completions and the generated `zettelflow.d.ts` read, so it cannot",
        "fall behind the code.",
        "",
        "For what the surfaces are, which variables each one binds, and worked recipes, see the",
        "[API reference](ZettelFlowAPI.md) and the [cookbook](cookbook.md).",
        "",
    ];

    for (const namespace of ordered) {
        lines.push(`## ${NAMESPACE_TITLES[namespace] ?? `\`${namespace}\``}`);
        lines.push("");
        lines.push("| Member | Signature | What it answers |");
        lines.push("|---|---|---|");
        for (const member of (groups.get(namespace) ?? []).slice().sort((a, b) => a.path.localeCompare(b.path))) {
            const name = member.path.slice(member.path.lastIndexOf(".") + 1);
            lines.push(`| \`${name}\` | \`${cell(member.signature)}\` | ${cell(member.summary)} |`);
        }
        lines.push("");
    }

    lines.push("!!! info \"Your own scripts and integrations are not listed here\"");
    lines.push("    `zf.internal.user` holds the functions from your JS-library folder and `zf.external`");
    lines.push("    holds Dataview and Templater when installed — all resolved in your vault, not in the");
    lines.push("    plugin. The editor completes them from the live object, and the generated");
    lines.push("    `zettelflow.d.ts` includes them by name.");
    lines.push("");

    return lines.join("\n");
}
