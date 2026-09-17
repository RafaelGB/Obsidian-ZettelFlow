import { Action } from "architecture/api";
import type { ScriptRun } from "application/scripts/scriptRunLog";
import type { ScriptErrorPolicy } from "application/scripts/errorPolicy";
import { DEFAULT_RETENTION_DAYS } from "application/scripts/scriptRunLog";
import { StepSettings } from "zettelkasten";
import type { HistoryEntry } from "application/notes/historyUtils";
import {
    DEFAULT_STATE_PROPERTY,
    DEFAULT_CREATED_PROPERTY,
    DEFAULT_LAST_REVIEWED_PROPERTY,
} from "architecture/knowledge/lifecycle/states";
import type { AiSettings } from "architecture/ai";
import type { Snapshot } from "architecture/knowledge/timeline/recordSnapshot";
import type { Judgement } from "architecture/knowledge/judgement";

/**
 * A saved "ask your graph" query (#323 G4). `query` is the identity (the predicate text); `name`
 * is an optional human label; `pinned` surfaces it on Home as a live "N notes match …" card.
 */
export interface SavedGraphQuery {
    query: string;
    name?: string;
    pinned?: boolean;
}

export type PropertyHookSettings = {
    /** Script to execute when the property changes */
    script: string;
    /** Whether the hook is active (#327 S3). Undefined = enabled (back-compat). */
    enabled?: boolean;
    /** Optional human-readable label shown in the settings list (#327 S3). */
    description?: string;
    /** Optional `zf` condition; the hook runs only when it holds (#327 S4). Blank = always. */
    condition?: string;
    /**
     * What a failure should do (#445). A hook has one script and nothing after it, so *skip* and
     * *stop* both mean "apply none of its changes"; *silent* means "do not interrupt me".
     * Absent = notify, which is what hooks have always done.
     */
    onError?: ScriptErrorPolicy;
};
/**
 * Main settings interface for the ZettelFlow plugin.
 */
export interface ZettelFlowSettings {
    /** Versioned, sensitive local inquiry checkpoint. Unknown/corrupt data is retained for recovery. */
    inquiry?: unknown;
    /**
     * Versioned, sensitive local note-builder drafts (#410) — an unfinished walk, so closing the
     * modal does not destroy it. Unknown or corrupt data is retained, never deleted.
     */
    wizardDrafts?: unknown;
    /** Whether the wizard keeps drafts at all (#410). Undefined reads as on. */
    wizardDraftsEnabled?: boolean;
    /**
     * **Deliberate friction in the note builder** (#411): ask for your own reading before the
     * connection suggestions appear. Unlike Cultivate's `cultivateFriction` this is **off** by
     * default — note creation is high-frequency, and the manifesto is explicit that friction is not
     * a tax on every click.
     */
    builderFriction?: boolean;
    /**
     * How dense the note-builder wizard renders (#409). Undefined reads as "comfortable", so an
     * install predating the setting keeps today's spacing.
     */
    wizardDensity?: "comfortable" | "compact";
    /** Logging level, including `off` — which is what the retired enable toggle meant (#439). */
    logLevel: string;
    /** Unique-title prefix pattern (e.g. "YYYYMMDDHHmmss"); **empty means no prefix** (#439). */
    uniquePrefix: string;
    /**
     * **Colour canvas nodes by phase** (#429): choosing a step's phase paints its node in that
     * phase's colour without asking. OFF by default — a canvas someone already coloured is theirs,
     * so the editor offers the colour as a one-click suggestion instead. Clearing a phase never
     * clears a colour: removing meaning must not repaint a canvas.
     */
    colourNodesByPhase?: boolean;
    /** Identifier for the ribbon canvas */
    ribbonCanvas: string;
    /** Identifier for the editor canvas */
    editorCanvas: string;
    /** Path to the folder containing JavaScript libraries */
    jsLibraryFolderPath: string;
    /** Path to the folder where flows are stored */
    foldersFlowsPath: string;
    /**
     * Home of the **event flows** (#436): the canvases whose root carries a trigger. Separate from
     * {@link foldersFlowsPath} because a canvas cannot be both the automation of a folder (by its
     * filename) and a flow that reacts to an event — which is exactly what sharing one folder made
     * it. The two may be neither equal nor nested (`validateFlowFolders`).
     */
    eventFlowsPath: string;
    /**
     * Path prefixes to exclude from the knowledge system (#311). Notes under any of these (config,
     * templates, other vault tooling) never enter the index, so they drop out of every mechanism —
     * graph, health, discovery, cultivate, home. Folder-boundary "starts with" match. Default: none.
     */
    excludedPaths: string[];
    /**
     * Which Cultivate moves a thinking session includes (#318 S1) — a subset of
     * connect/challenge/question/advance/source. Undefined = all (the default recipe).
     */
    cultivateMoves?: string[];
    /**
     * **Deliberate friction** (#338, epic #335): connect / challenge / source ask for your own reading
     * before revealing theirs. ON by default — the manifesto describes this as what the product does,
     * not as an option. Undefined reads as on, so an install predating the setting still gets it.
     */
    cultivateFriction?: boolean;
    /**
     * Saved "ask your graph" queries (#318 S3; enriched #323 G4). A useful query can be named,
     * reordered and pinned to Home. Persisted as {@link SavedGraphQuery} objects; a bare string is
     * the legacy shape and is migrated transparently on read (`normalizeSavedQueries`).
     */
    savedGraphQueries?: (string | SavedGraphQuery)[];
    /** Installed templates divided into steps and actions */
    installedTemplates: InstalledTemplates;

    /** Community-specific settings. The gallery is fully static (GitHub-backed) — no backend. */
    communitySettings: {
        /** Folder where Markdown templates are stored */
        markdownTemplateFolder: string;
        /**
         * Optional default clipboard template,
         * can be either a step or an action.
         */
        clipboardTemplate?: CommunityStepSettings | CommunityAction;
    };
    hooks: {
        /** Global hooks that will be executed on property changes on current file */
        properties: Record<string, PropertyHookSettings>;

        /** Folder path with the potential Flows to be executed by the hooks */
        folderFlowPath: string;

    }

    /** Note lifecycle (#146): configurable frontmatter property names (no lock-in). */
    lifecycle: {
        /** Property carrying the lifecycle state token (default "state"). */
        stateProperty: string;
        /** Property carrying the capture timestamp (default "created"). */
        createdProperty: string;
        /** Property carrying the last-reviewed timestamp (default "last-reviewed"). */
        lastReviewedProperty: string;
    };

    /** Semantic relations (#147). */
    relations: {
        /**
         * Parse inline `key:: [[X]]` relations by reading note bodies (a deferred pass). When
         * unset, defaults to on for desktop and off for mobile (resolved at runtime).
         */
        parseInlineRelations?: boolean;
    };

    /**
     * The **script run log** (#444): every run a scripting surface performed, newest first, kept
     * for `retentionDays` (7 by default, up to 30). Facts only — paths, names and the keys a
     * script was handed, never a note's content.
     */
    scriptLog?: {
        runs: ScriptRun[];
        retentionDays: number;
    };

    /**
     * Optional, provider-agnostic AI (#156). OFF by default: while `enabled` is false no AI action
     * ever reaches the network. Bring-your-own OpenAI-compatible endpoint + key + model.
     */
    ai: AiSettings;

    /**
     * Development-event journal (#162), the data source for the thinking heatmap. ON by default:
     * privacy-benign — a capped per-day count map only (no note paths, no content, no network).
     */
    journal: {
        enabled: boolean;
        /** `YYYY-MM-DD` → development-event count, pruned to the last ~year. */
        counts: Record<string, number>;
    };

    /**
     * Conceptual evolution timeline (#168). **OFF by default (opt-in)** — unlike the journal's
     * path-free counts, this stores per-note lifecycle `state` + claim texts + timestamps, so it is
     * consent-first: strictly **local** (never networked), **bounded** (per-note and total-notes
     * caps), pruned on note delete/rename, and cleared when the user turns it off.
     */
    timeline: {
        enabled: boolean;
        /** Vault path → the note's conceptual snapshots, oldest→newest. */
        snapshots: Record<string, Snapshot[]>;
    };

    /**
     * The **judgement record** (#336, epic #335) — the data behind *cognitive agency*. ON by default:
     * unlike the timeline it stores **no content**, only locale-free descriptors (a note path, a short
     * subject id, an origin and a verdict), strictly local, bounded and never networked. Off would ship
     * the whole chapter dead, since #337/#338/#339 have nothing to read without it.
     */
    judgements: {
        enabled: boolean;
        /** The bounded chronological log, oldest→newest. */
        log: Judgement[];
    };

    /**
     * Knowledge Patterns (#170/#200). When `rerunOnIndex` is on, a note created from a pattern with
     * on-creation actions has that pattern re-run once **after** the vault indexes the note, so graph
     * results (related, contradictions, maturity …) fill in on the first pass. ON by default: offline,
     * writes only the pattern's own declared keys, and a one-click toggle for anyone who objects to a
     * second write to a just-created note.
     */
    patterns: {
        rerunOnIndex: boolean;
    };

    /** Notes created by ZettelFlow, most-recent first. Capped at 50. */
    history: HistoryEntry[];
    /** True once the first-launch welcome notice has been shown. */
    hasSeenWelcome: boolean;
    /** When true, new notes are created in the active file's folder instead of the step's targetFolder. */
    createInCurrentFolder: boolean;
    /** When true, ZettelFlow Home opens automatically on launch (the "open ZettelFlow, not Obsidian" front door, #246 A2). */
    openHomeOnStartup: boolean;
}

export type { HistoryEntry } from "application/notes/historyUtils";


/**
 * Base properties for community templates.
 */
export type CommunityTemplateOptions = {
    /** Unique identifier for the template */
    id: string;
    /** Template title */
    title: string;
    /** Brief description of the template */
    description: string;
    /** Author of the template */
    author: string;
    /** Type of the template: either "step" or "action" */
    template_type: "step" | "action";
};

/**
 * Options for static templates, including Markdown templates.
 */
export type StaticTemplateOptions = {
    /** Unique identifier for the template */
    id: string;
    /** Reference or path to the template */
    ref: string;
    /** Template title */
    title: string;
    /** Brief description of the template */
    description: string;
    /** Author of the template */
    author: string;
    /**
     * Type of the template: a "step"/"action"/"markdown" fragment, or a "system" — a `.zftemplate`
     * bundle installed as a canvas + steps in one click (#214).
     */
    template_type: "step" | "action" | "markdown" | "system";
    /** For systems: how much a newcomer takes on — shown as a badge in the gallery. */
    difficulty?: SystemDifficulty;
};

/** A system's onboarding difficulty (shown as a gallery badge). */
export type SystemDifficulty = "easy" | "medium" | "hard";

/**
 * Combines StepSettings with community template options.
 */
export type CommunityStepSettings = StepSettings & CommunityTemplateOptions;

/**
 * Combines Action with community template options.
 */
export type CommunityAction = Action & CommunityTemplateOptions;

/**
 * Structure to store installed templates, divided into steps and actions.
 */
export type InstalledTemplates = {
    /** A record mapping step template IDs to their settings */
    steps: Record<string, CommunityStepSettings>;
    /** A record mapping action template IDs to their settings */
    actions: Record<string, CommunityAction>;
};

/**
 * Default settings for ZettelFlow.
 */
export const DEFAULT_SETTINGS: Partial<ZettelFlowSettings> = {
    logLevel: "off", // No logging until someone asks for it (#439).
    uniquePrefix: "", // No prefix until someone writes a pattern (#439).
    colourNodesByPhase: false, // A canvas you already coloured is yours (#429).
    ribbonCanvas: "", // No ribbon canvas configured until the user picks one.
    editorCanvas: "", // No editor canvas configured until the user picks one.
    jsLibraryFolderPath: "", // No JS library folder configured by default.
    foldersFlowsPath: "_ZettelFlow/folders", // Default folder for storing flows.
    eventFlowsPath: "_ZettelFlow/events", // Home of the flows that react to vault events (#436).
    excludedPaths: [], // Nothing excluded by default — the user opts in (#311).
    scriptLog: { runs: [], retentionDays: DEFAULT_RETENTION_DAYS }, // The script run log (#444).
    installedTemplates: {
        steps: {},   // No step templates are installed by default.
        actions: {}  // No action templates are installed by default.
    },
    communitySettings: {
        markdownTemplateFolder: "_ZettelFlowMdTemplates", // Default folder for Markdown templates.
    },
    hooks: {
        properties: {}, // No global hooks are defined by default.
        folderFlowPath: "_ZettelFlow/hooks" // Default folder for flow scripts.
    },
    lifecycle: {
        stateProperty: DEFAULT_STATE_PROPERTY,
        createdProperty: DEFAULT_CREATED_PROPERTY,
        lastReviewedProperty: DEFAULT_LAST_REVIEWED_PROPERTY,
    },
    cultivateFriction: true, // Ask before revealing (#338); the pause is where the thinking happens.
    relations: {}, // parseInlineRelations resolved at runtime: on desktop, off mobile.
    ai: { enabled: false, endpoint: "", apiKey: "", model: "" }, // AI is opt-in, off by default (#156).
    journal: { enabled: true, counts: {} }, // Development-event journal on by default (#162).
    timeline: { enabled: false, snapshots: {} }, // Conceptual evolution timeline opt-in (#168, stores note content).
    judgements: { enabled: true, log: [] }, // Judgement record on by default (#336); descriptors only, no content.
    patterns: { rerunOnIndex: true }, // Post-index pattern re-run on by default (#200); offline, own keys only.
    history: [],
    hasSeenWelcome: false,
    createInCurrentFolder: false,
    openHomeOnStartup: false, // Off by default; first-run onboarding turns it on for new users (#246 A2).
};
