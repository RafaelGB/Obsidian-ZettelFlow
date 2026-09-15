import { isSemanticRelationType } from "architecture/knowledge/relations/vocabulary";
import { semanticRelationField } from "actions/createSemanticRelation/createSemanticRelationLogic";
import { substituteContextTokens } from "./contextTokens";
import { composeDestination } from "./destination";

/**
 * The **satellite note** (#419, epic #405) — pure validation and resolution.
 *
 * A flow produces one note; the canonical Zettelkasten move produces two — the literature note for
 * what you read and the permanent note for what you now think, related by *meaning*. Doing that
 * today costs two passes through the wizard and a manual link, so people write one note that mixes a
 * source with an idea, which Health then correctly flags as unsourced. The engine was working
 * against the method it exists to serve.
 *
 * The design rule that keeps it simple: a satellite is **declared when authoring the step**, never
 * walked at runtime. It is a byproduct — a template, a title pattern and a relation — so the wizard
 * asks nothing extra and `NoteDTO` still models exactly one note.
 *
 * Obsidian-free: the same token vocabulary the body templates use, and the *one* function that
 * builds a typed relation.
 */

/** Which note carries the frontmatter edge. */
export type SatelliteDirection = "main-to-satellite" | "satellite-to-main";

/** What a step declares, as authored in its YAML/frontmatter settings. */
export interface SatelliteDeclaration {
    /** Step-template note the satellite is built from. */
    template: string;
    /** Title pattern, in the body-template token vocabulary plus `{{title}}`. */
    title: string;
    /** Where it lands; the main note's folder when absent. */
    targetFolder?: string;
    relation: {
        type: string;
        direction: SatelliteDirection;
    };
}

export type SatelliteError =
    | "template-missing"
    | "title-empty"
    | "relation-invalid"
    | "self-relation";

export interface SatelliteEdge {
    /** The note the frontmatter field is written on. */
    on: "main" | "satellite";
    /** The note it points at, without extension. */
    target: string;
    /** The frontmatter key — the relation type. */
    key: string;
    /** The frontmatter value — a `[[wikilink]]`. */
    value: string;
}

export interface SatellitePlan {
    template: string;
    title: string;
    path: string;
    edge: SatelliteEdge;
}

export interface SatelliteContext {
    /** The main note's final title (after the unique prefix). */
    mainTitle: string;
    /** The main note's final path, for the folder fallback and the self-relation guard. */
    mainPath: string;
    frontmatter: Record<string, unknown>;
    canvasName: string;
}

/** Defects a declaration can carry on its own, before any context is applied. */
export function validateSatellite(
    declaration: SatelliteDeclaration
): SatelliteError | undefined {
    if (!declaration.template || declaration.template.trim().length === 0) {
        return "template-missing";
    }
    if (!declaration.title || declaration.title.trim().length === 0) return "title-empty";
    if (!declaration.relation || !isSemanticRelationType(declaration.relation.type)) {
        return "relation-invalid";
    }
    return undefined;
}

/**
 * The satellite's name. `{{title}}` is the main note's title — the one token the body pipeline also
 * resolves itself (`previewAssembly` step 4) — and everything else goes through
 * {@link substituteContextTokens}, so there is one token language rather than two.
 */
export function satelliteTitle(pattern: string, context: SatelliteContext): string {
    const withTitle = pattern.replace(/{{title}}/g, context.mainTitle);
    return substituteContextTokens(withTitle, context.frontmatter, context.canvasName)
        .trim()
        .replace(/\.md$/i, "")
        .trim();
}

function folderOf(path: string): string {
    const cut = path.lastIndexOf("/");
    return cut <= 0 ? "" : path.slice(0, cut);
}

/**
 * The resolved plan, or the error that stops the build before it writes anything. `undefined` when
 * the step declares no satellite — the overwhelmingly common case, and byte-identical behaviour.
 */
export function resolveSatellite(
    declaration: SatelliteDeclaration | undefined,
    context: SatelliteContext
): SatellitePlan | { error: SatelliteError } | undefined {
    if (!declaration) return undefined;

    const invalid = validateSatellite(declaration);
    if (invalid) return { error: invalid };

    const title = satelliteTitle(declaration.title, context);
    if (title.length === 0) return { error: "title-empty" };

    const folder = declaration.targetFolder?.trim() || folderOf(context.mainPath);
    const path = composeDestination(folder, title);
    // A note relating to itself is a defect, not a knowledge structure.
    if (path === context.mainPath || title === context.mainTitle) {
        return { error: "self-relation" };
    }

    const on = declaration.relation.direction === "main-to-satellite" ? "main" : "satellite";
    const target = on === "main" ? title : context.mainTitle;
    const field = semanticRelationField(declaration.relation.type, target);
    // `validateSatellite` already vetted the type, so this cannot be null — but never assume.
    if (!field) return { error: "relation-invalid" };

    return { template: declaration.template, title, path, edge: { on, target, ...field } };
}

/**
 * One locale key per declaration defect. Literal keys in a map, so the #320 unrendered-strings
 * guardrail can see all four (the trap #411 hit with a composed lookup).
 */
export const SATELLITE_ERROR_KEYS = {
    "template-missing": "satellite_error_template_missing",
    "title-empty": "satellite_error_title_empty",
    "relation-invalid": "satellite_error_relation_invalid",
    "self-relation": "satellite_error_self_relation",
} as const;

/**
 * What the satellite will contain, for the preview (#419 FR-5) and for the writer: its **own**
 * template, plus the edge when the declared direction puts it on the satellite. The main note's
 * content never leaks in — a satellite is not a copy.
 */
export function satellitePreview(
    plan: SatellitePlan,
    template: { frontmatter: Record<string, unknown>; body: string }
): { frontmatter: Record<string, unknown>; body: string } {
    const frontmatter = { ...template.frontmatter };
    if (plan.edge.on === "satellite") frontmatter[plan.edge.key] = plan.edge.value;
    return { frontmatter, body: template.body };
}
