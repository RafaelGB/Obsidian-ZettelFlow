/**
 * Every capability, and how you reach it (#575, epic #574) — pure data.
 *
 * The [reposition map](../../../../../docs/architecture/reposition-map.md) already says what this
 * product can do and which **layer** owns it. What has never existed is the other axis — *how a
 * person gets there* — and a document would be the wrong place for it, because a document does not
 * fail when a mode is renamed.
 *
 * So this is the second axis of the surface registry, in the same shape as every other closed
 * vocabulary here (`SURFACES`, `MOVEMENTS`, `WORKFLOW_EVENTS`): one declared list, exhaustive, with
 * a compile error for a capability that has no entry and for an entry with no door.
 *
 * **A capability is a thing a person can do that has a name in the locale.** That definition is
 * what stops this becoming a second copy of the docs nav: an internal seam has no name anyone could
 * read, and one page documenting three doors is not three capabilities.
 *
 * The epic that produced it started from a report — the person who specified *think before you
 * look* could not find it in their own vault.
 */

/**
 * The five ranked kinds of door. They are not equivalent, and the rank is the whole point.
 *
 * 1–3 are **discovery**: you arrive at the capability without having been told it exists. 4 and 5
 * are **re-entry**: useful to someone who already knows, useless to everyone else. Guardrail A is
 * the one line this ranking exists to draw.
 */
export type DoorKind =
    /**
     * 1 — a control on screen where you already are: an entry on the note's menu, a button in the
     * view showing the thing, the ribbon menu. The ribbon counts here because it is the one control
     * that is always visible, whatever you have open (#231 Phase 2).
     */
    | "object"
    /** 2 — a surface, or a mode of one. One front door per job (#268, #272). */
    | "surface"
    /** 3 — it comes to you: a line on Home that arrives without being looked for. */
    | "recommendation"
    /** 4 — a settings row. For configuring, never for discovering. */
    | "settings"
    /** 5 — a command. A hotkey and a re-entry point, **never** a discovery path (#496). */
    | "command";

/** How an `object` door is attached, which is also how {@link CAPABILITY_DOORS} is checked. */
export type DoorVia =
    /** The note's context menu — `at` is the file registering the `file-menu` handler. */
    | "menu"
    /** A control inside a view — `at` is the renderer file, `host` the surface it draws in. */
    | "control"
    /** The ribbon's menu — `at` is the command id the entry runs, checked against its table. */
    | "ribbon";

export interface Door {
    kind: DoorKind;
    /**
     * Where it is, in a form that can be **resolved** rather than believed: a command id, a
     * `viewType:mode` pair, a path under `src/`, or a locale key for a settings group. A renamed
     * mode or a deleted renderer fails the audit instead of leaving a dead door behind.
     */
    at: string;
    via?: DoorVia;
    /** For a `control` door: the surface whose view it is drawn in. */
    host?: string;
}

export interface Capability {
    /** The i18n key of its name. A capability with no name in the locale is not one. */
    nameKey: string;
    /** The surface or subsystem that owns it — the "one home per capability" answer (#268). */
    owner: string;
    /** Its doors, best first. At least one, enforced by the type. */
    doors: readonly [Door, ...Door[]];
}

/**
 * Every capability, in one list. A new one without an entry below is a compile error.
 *
 * **A capability is something you do to something.** If there is no object — no note, no selection,
 * no question — and the thing is a standing rule the plugin follows while you are elsewhere, it is
 * **configuration**, and settings is its home by design rather than by neglect.
 *
 * That line is why knowledge patterns and the vault hooks are not here (#578). Both have a name, a
 * settings group and a docs page; neither is something you *open*. Writing the line down matters
 * more than the two rows it removes, because without it "it is only configuration" becomes the
 * excuse that empties guardrail A of meaning. Quick capture, deriving a project and the weekly
 * review all have an object, and all three got a real door instead.
 */
export const CAPABILITIES = [
    "note-creation",
    "run-a-flow",
    "canvas-editing",
    "quick-capture",
    "home",
    "moc-builder",
    "derive-project",
    "knowledge-map",
    "concept-nav",
    "explore",
    "graph-lens",
    "reasoning-paths",
    "slipbox-health",
    "knowledge-dashboard",
    "weekly-review",
    "thinking-heatmap",
    "evolution-timeline",
    "evidence-map",
    "open-questions",
    "resurface",
    "atomicity-split",
    "cultivate",
    "inquiry",
    "thought-lab",
    "blind-ask",
    "collision",
    "moves",
    "think-about",
    "claim-door",
    "claim-return",
    "wager",
    "agency-review",
    "note-state",
    "remove-relation",
    "script-workbench",
    "systems-gallery",
    "template-export",
    "template-import",
    "manage-templates",
] as const;

export type CapabilityId = (typeof CAPABILITIES)[number];

const HOME = "zettelflow-home";
const HEALTH = "zettelflow-health";
const EXPLORE = "zettelflow-explore";

const RIBBON = (command: string): Door => ({ kind: "object", at: command, via: "ribbon" });
const NOTE_MENU = (file: string): Door => ({ kind: "object", at: file, via: "menu" });
const CONTROL = (file: string, host: string): Door => ({ kind: "object", at: file, via: "control", host });
const CMD = (id: string): Door => ({ kind: "command", at: id });

/**
 * How you reach each one, best door first.
 *
 * The rule guardrail A enforces: **every capability has at least one door of rank 1–3**. A
 * capability whose only door is a command is one nobody discovers — the palette is where you go
 * looking for something you already know is there (#496).
 */
export const CAPABILITY_DOORS: Record<CapabilityId, Capability> = {
    "note-creation": {
        nameKey: "command_open_workflow",
        owner: "workflow",
        doors: [RIBBON("open-workflow"), CMD("open-workflow")],
    },
    "run-a-flow": {
        nameKey: "command_run_canvas_flow",
        owner: "workflow",
        doors: [RIBBON("run-canvas-flow"), CMD("run-canvas-flow"), CMD("editor-menu-flow")],
    },
    "canvas-editing": {
        nameKey: "command_settings_open_canvas",
        owner: "workflow",
        doors: [RIBBON("open-canvas"), { kind: "settings", at: "settings_group_creating" }, CMD("open-canvas")],
    },
    "quick-capture": {
        nameKey: "command_quick_capture",
        owner: HOME,
        doors: [CONTROL("architecture/components/core/home/HomeModeRenderer.ts", HOME), CMD("quick-capture")],
    },
    home: {
        nameKey: "surface_home_title",
        owner: HOME,
        doors: [RIBBON("show-home"), { kind: "surface", at: `${HOME}:home` }, CMD("show-home")],
    },
    "moc-builder": {
        nameKey: "moc_modal_title",
        owner: EXPLORE,
        doors: [
            CONTROL("architecture/components/core/askGraph/AskGraphRenderer.ts", EXPLORE),
            CMD("build-map-of-content"),
        ],
    },
    "derive-project": {
        // The folder's context menu, not the note's: a project is derived *from a folder*.
        nameKey: "derive_project_command_name",
        owner: "projects",
        doors: [NOTE_MENU("starters/zcomponents/DeriveProjectComponent.ts"), CMD("derive-project")],
    },
    "knowledge-map": {
        nameKey: "command_show_knowledge_map",
        owner: EXPLORE,
        doors: [{ kind: "surface", at: `${EXPLORE}:explore` }, CMD("show-knowledge-map")],
    },
    "concept-nav": {
        nameKey: "command_show_concept_nav",
        owner: EXPLORE,
        doors: [{ kind: "surface", at: `${EXPLORE}:explore` }, CMD("show-concept-nav")],
    },
    explore: {
        nameKey: "surface_explore_title",
        owner: EXPLORE,
        doors: [RIBBON("ask-your-graph"), { kind: "surface", at: `${EXPLORE}:explore` }, CMD("ask-your-graph")],
    },
    "graph-lens": {
        nameKey: "command_explore_in_3d",
        owner: EXPLORE,
        doors: [
            CONTROL("architecture/components/core/askGraph/AskGraphRenderer.ts", EXPLORE),
            CMD("explore-in-3d"),
            CMD("show-graph"),
        ],
    },
    "reasoning-paths": {
        // Merged into the per-note mode rather than given a door of its own (#578): tracing what
        // leaves a note is a question about *that* note, and this is the mode that answers those.
        nameKey: "command_explore_reasoning_paths",
        owner: HEALTH,
        doors: [
            CONTROL("architecture/components/core/timeline/EvolutionTimelineRenderer.ts", HEALTH),
            CMD("explore-reasoning-paths"),
        ],
    },
    "slipbox-health": {
        nameKey: "surface_health_title",
        owner: HEALTH,
        doors: [RIBBON("show-health"), { kind: "surface", at: `${HEALTH}:health` }, CMD("show-slipbox-health")],
    },
    "knowledge-dashboard": {
        nameKey: "command_show_knowledge_dashboard",
        owner: HEALTH,
        doors: [{ kind: "surface", at: `${HEALTH}:health` }, CMD("show-knowledge-dashboard")],
    },
    "weekly-review": {
        nameKey: "weekly_review_command_name",
        owner: HEALTH,
        doors: [
            CONTROL("architecture/components/core/slipboxHealth/SlipboxHealthRenderer.ts", HEALTH),
            CMD("generate-weekly-review"),
        ],
    },
    "thinking-heatmap": {
        nameKey: "surface_mode_momentum",
        owner: HEALTH,
        doors: [{ kind: "surface", at: `${HEALTH}:momentum` }, CMD("show-thinking-heatmap")],
    },
    "evolution-timeline": {
        nameKey: "surface_mode_timeline",
        owner: HEALTH,
        doors: [
            { kind: "surface", at: `${HEALTH}:timeline` },
            CMD("show-evolution-timeline"),
            CMD("show-notes-history"),
        ],
    },
    "evidence-map": {
        nameKey: "command_show_evidence_map",
        owner: HEALTH,
        doors: [{ kind: "surface", at: `${HEALTH}:timeline` }, CMD("show-evidence-map")],
    },
    "open-questions": {
        nameKey: "command_show_open_questions",
        owner: HOME,
        doors: [{ kind: "surface", at: `${HOME}:home` }, CMD("show-open-questions")],
    },
    resurface: {
        nameKey: "resurface_view_title",
        owner: HOME,
        doors: [
            { kind: "recommendation", at: `${HOME}:home` },
            CMD("resurface-related-notes"),
            CMD("show-discoveries"),
            CMD("show-discovery"),
        ],
    },
    "atomicity-split": {
        nameKey: "command_atomicity_split",
        owner: "thinking",
        doors: [NOTE_MENU("starters/zcomponents/MoveCommandsComponent.ts"), CMD("split-note-into-atomic-notes")],
    },
    cultivate: {
        nameKey: "surface_mode_cultivate",
        owner: HOME,
        doors: [RIBBON("cultivate"), { kind: "surface", at: `${HOME}:cultivate` }, CMD("cultivate")],
    },
    inquiry: {
        nameKey: "inquiry_title",
        owner: HOME,
        doors: [CONTROL("architecture/components/core/cultivate/CultivateModeRenderer.ts", HOME)],
    },
    "thought-lab": {
        nameKey: "surface_mode_lab",
        owner: HOME,
        doors: [RIBBON("think"), { kind: "surface", at: `${HOME}:lab` }, CMD("think")],
    },
    "blind-ask": {
        // Moved out of the Lab's header and into the surface where the asking happens (#576).
        // Same rank, a door you can actually see — which is the part a registry cannot measure.
        nameKey: "blind_title",
        owner: EXPLORE,
        doors: [CONTROL("architecture/components/core/askGraph/AskGraphRenderer.ts", EXPLORE)],
    },
    collision: {
        nameKey: "collision_title",
        owner: HOME,
        doors: [
            CONTROL("architecture/components/core/lab/LabRenderer.ts", HOME),
            NOTE_MENU("starters/zcomponents/MoveCommandsComponent.ts"),
        ],
    },
    moves: {
        nameKey: "move_pick_title",
        owner: "thinking",
        doors: [
            NOTE_MENU("starters/zcomponents/MoveCommandsComponent.ts"),
            CONTROL("architecture/components/core/cultivate/CultivateModeRenderer.ts", HOME),
        ],
    },
    "think-about": {
        nameKey: "command_think_about",
        owner: HOME,
        doors: [NOTE_MENU("starters/zcomponents/ThinkAboutComponent.ts"), CMD("think-about-this-note")],
    },
    "claim-door": {
        nameKey: "claim_door_menu",
        owner: "claims",
        doors: [
            NOTE_MENU("starters/zcomponents/ClaimDoorComponent.ts"),
            CONTROL("architecture/components/core/cultivate/CultivateModeRenderer.ts", HOME),
        ],
    },
    "claim-return": {
        nameKey: "claim_return_title",
        owner: "claims",
        doors: [{ kind: "recommendation", at: `${HOME}:home` }, CMD("return-to-this-claim")],
    },
    wager: {
        nameKey: "home_claim_return_wager_title",
        owner: "claims",
        // You **set** a wager on the note, and you are **told** about it on Home. The rank puts the
        // menu first; the sequence a person lives is the other way round, and both are true.
        doors: [
            NOTE_MENU("starters/zcomponents/ClaimDoorComponent.ts"),
            { kind: "recommendation", at: `${HOME}:home` },
        ],
    },
    "agency-review": {
        nameKey: "surface_mode_agency",
        owner: HEALTH,
        doors: [{ kind: "surface", at: `${HEALTH}:agency` }],
    },
    "note-state": {
        // The state chip on Cultivate's target card. The state is right there, on the object the
        // change is about — and it opens the same picker the command does, not a second one.
        nameKey: "command_change_note_state",
        owner: "lifecycle",
        doors: [
            CONTROL("architecture/components/core/cultivate/CultivateModeRenderer.ts", HOME),
            CMD("change-note-state"),
        ],
    },
    "remove-relation": {
        // On the note, and only on a note that has a relation: the menu is not ours to fill, so
        // the entry earns its line by never appearing where it would do nothing.
        nameKey: "command_remove_relation",
        owner: "relations",
        doors: [NOTE_MENU("starters/zcomponents/RemoveRelationComponent.ts"), CMD("remove-relation")],
    },
    "script-workbench": {
        nameKey: "workbench_title",
        owner: "scripting",
        doors: [CONTROL("architecture/components/core/codeView/CodeView.ts", "editor"), CMD("open-script-workbench")],
    },
    "systems-gallery": {
        nameKey: "command_browse_systems",
        owner: "community",
        doors: [RIBBON("browse-systems"), CMD("browse-systems"), CMD("open-community-templates")],
    },
    "template-export": {
        nameKey: "command_export_canvas_template",
        owner: "community",
        doors: [RIBBON("export-canvas-template"), CMD("export-canvas-template")],
    },
    "template-import": {
        nameKey: "command_import_canvas_template",
        owner: "community",
        doors: [RIBBON("import-canvas-template"), CMD("import-canvas-template")],
    },
    "manage-templates": {
        nameKey: "command_open_manage_templates",
        owner: "community",
        doors: [
            RIBBON("open-manage-templates"),
            { kind: "settings", at: "settings_group_creating" },
            CMD("open-manage-templates"),
        ],
    },
};

/** The rank of a door kind — 1 is best, and 1–3 is what guardrail A requires one of. */
export const DOOR_RANK: Record<DoorKind, number> = {
    object: 1,
    surface: 2,
    recommendation: 3,
    settings: 4,
    command: 5,
};

/** The best (lowest) rank among a capability's doors — the audit's `depth` column. */
export function depthOf(id: CapabilityId): number {
    return Math.min(...CAPABILITY_DOORS[id].doors.map((door) => DOOR_RANK[door.kind]));
}

/** Capabilities with no door better than a settings row — the ones guardrail A is about. */
export function doorless(): CapabilityId[] {
    return CAPABILITIES.filter((id) => depthOf(id) > 3);
}

/**
 * Empty, and that is the point (#578).
 *
 * It shipped with eleven rows in #575 — every one of them a capability whose only door was a
 * command or a settings switch — and each was keyed to the issue that would fix it, so the
 * guardrail could ship green without the failures being forgiven. #578 emptied it.
 *
 * The register stays: a capability that genuinely cannot ship its door in the same change goes
 * here with an issue number, and `capabilityDoors.test.ts` fails when a row stops failing and keeps
 * its excuse — so it can only shrink.
 *
 * *What actually happened to the eleven.* Nine got a real door: quick capture and the weekly review
 * became the primary control of the surface that owns them, editing the canvas and both template
 * doors joined the ribbon's systems group, deriving a project went to the folder's context menu,
 * changing a note's state to the chip that displays it, removing a relation to the note's menu, and
 * tracing a reasoning path merged into the per-note mode. **Nothing was deleted** — every one of
 * the eleven was a thing a person would want; what they lacked was a way in.
 *
 * The other two left the inventory, and the line they failed is written above {@link CAPABILITIES}:
 * knowledge patterns and the vault hooks are **configuration**, not capabilities. That is not the
 * guardrail being talked out of a failure — it is the definition it was always enforcing, applied
 * to two rows that never satisfied it.
 */
export const DOORLESS: Partial<Record<CapabilityId, string>> = {};
