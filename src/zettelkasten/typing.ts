import { Menu, TFolder } from "obsidian";
import { Action } from "architecture/api";
import { ZettelNodeType } from "architecture/plugin"
import { HexString } from "obsidian"
import type { ZettelIdStrategy, FolgezettelRelationship } from "../actions/zettelId/zettelIdLogic";
import type { StepPhase } from "./phases";
import type { WorkflowTrigger } from "architecture/plugin/events";
import type { WaitSettings } from "architecture/plugin/workflow";

export type StepBuilderInfo = {
    type: string,
    contentEl: HTMLElement,
    filename?: string;
    folder?: TFolder;
    menu?: Menu,
    nodeId?: string,
    /** Markdown body of the step file (template content). Managed by StepBuilderModal only. */
    body?: string;
    // EXCLUSIVE for COMMUNITY installed steps
    title?: string,
    description?: string,
} & StepSettings;

export type StepSettings = {
    root: boolean
    actions: Action[],
    label: string
    targetFolder?: string
    childrenHeader?: string,
    optional?: boolean,
    /**
     * Optional knowledge-transformation phase this step advances (#149). Additive & cosmetic:
     * absence means "unphased"; it labels/groups the step in the builder and does NOT drive
     * execution or ordering. Orthogonal to the note lifecycle `state` (#146).
     */
    phase?: StepPhase,
    /**
     * Optional event-driven trigger (#150). Only meaningful on a flow's **root** step: it binds the
     * flow to a vault event so it can run without a manual launch. Additive & opt-in — absence means
     * the flow is manual-only (back-compat). Authored in frontmatter in v1 (no builder UI yet); the
     * builder preserves it opaquely so an unrelated edit never drops it.
     */
    trigger?: WorkflowTrigger,
    /**
     * Optional WAIT marker (#151): when present, the note-builder wizard pauses at this step until
     * the user confirms (human-in-the-loop). Additive & opt-in — absence means the step runs
     * straight through (back-compat). The only new block kind of the visual workflow language.
     */
    wait?: WaitSettings,
    /**
     * Optional **Knowledge Pattern** behavior (#170): an ordered list of `hasUI:false` actions the
     * note-builder runs on note creation, after the note's structure is assembled and before the file
     * is written — turning a static template into "structure + behavior". Additive & opt-in — absence
     * means a plain static template (back-compat). Authored in frontmatter/YAML in v1 (no builder UI
     * yet); the builder preserves it opaquely so an unrelated edit never drops it.
     */
    onCreation?: Action[],
}

export type ZettelFlowElement = {
    type: ZettelNodeType,
    childrenHeader: string,
    label: string,
    tooltip?: string,
    actions: Action[],
    color?: HexString,
    targetFolder?: string,
    optional?: boolean,
    // EXCLUSIVE FOR FILE
    path?: string,
    // EXCLUSIVE FOR EMBED NODE
    yaml?: string,
}

export type SectionInfo = {
    title: string
}
export type ZoneOption = 'frontmatter' | 'body' | 'context';

type StaticType = {
    staticBehaviour: boolean,
    staticValue?: string,

}
export type AditionBaseElement = {
    key: string,
    label: string,
    zone: ZoneOption,
} & Action & StaticType;

export type TagsElement = {
    staticValue?: string[],
} & StaticType & Action;

export type PromptElement = {
    placeholder: string,
} & AditionBaseElement;

export type NumberElement = {
    placeholder: string,
    staticValue?: number,
} & AditionBaseElement;

export type CalendarElement = {
    enableTime: boolean,
    format: string,
} & AditionBaseElement;

export type SelectorElement = {
    options: [string, string][],
    defaultOption?: string,
    multiple?: boolean,
} & AditionBaseElement;

export type DynamicSelectorElement = {
    code: string,
    multiple?: boolean,
} & AditionBaseElement;

export type CheckboxElement = {
    confirmTooltip: string,
    staticValue?: boolean,
} & AditionBaseElement;

/**
 * Config shared by the #153 knowledge actions (detect-orphan / calculate-maturity /
 * find-contradiction / find-unanswered-question): the result `key`, the `zone` it's written to, and
 * an optional `target` note to analyze (empty ⇒ the note being built).
 */
export type KnowledgeActionElement = {
    key: string,
    zone: ZoneOption,
    target?: string,
} & Action;

/**
 * Config shared by the #154 relation actions. Ranking actions (find-related / suggest-link) use
 * `key`/`zone`/`target` (target = the source note to rank against) plus an optional `limit`;
 * create-semantic-relation uses `relationType` (the #147 semantic type) + `target` (the destination
 * note it points to). One `target` field, two readings — see the #154 design decisions.
 */
export type RelationActionElement = {
    key: string,
    zone: ZoneOption,
    target?: string,
    limit?: number,
    relationType?: string,
} & Action;

/**
 * Config shared by the #155 research actions. The analysis actions (extract-claims / compare-claims
 * / find-sources) use `key`/`zone`/`target` (target = the source note to analyze) plus an optional
 * `limit` (find-sources top-K); attach-source uses `source` (the raw value to attach) + `zone`.
 */
export type ResearchActionElement = {
    key: string,
    zone: ZoneOption,
    target?: string,
    limit?: number,
    source?: string,
} & Action;

/** Config shared by the #156 AI actions: the result `key` and the `zone` it's written to. */
export type AiActionElement = {
    key: string,
    zone: ZoneOption,
} & Action;

export type { ZettelIdStrategy, FolgezettelRelationship };
export type ZettelIdElement = {
    strategy?: ZettelIdStrategy;
    key: string;
    writeFrontmatter: boolean;
    writeFilename: boolean;
    timestampFormat: string;
    parent?: string;
    relationship: FolgezettelRelationship;
} & Action;