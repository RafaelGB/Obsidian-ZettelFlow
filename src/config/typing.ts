import { Action } from "architecture/api";
import { StepSettings } from "zettelkasten";
import type { HistoryEntry } from "application/notes/historyUtils";
import {
    DEFAULT_STATE_PROPERTY,
    DEFAULT_CREATED_PROPERTY,
    DEFAULT_LAST_REVIEWED_PROPERTY,
} from "architecture/knowledge/lifecycle/states";
import type { AiSettings } from "architecture/ai";
import type { Snapshot } from "architecture/knowledge/timeline/recordSnapshot";

export type PropertyHookSettings = {
    /** Script to execute when the property changes */
    script: string;
    /** Whether the hook is active (#327 S3). Undefined = enabled (back-compat). */
    enabled?: boolean;
    /** Optional human-readable label shown in the settings list (#327 S3). */
    description?: string;
    /** Optional `zf` condition; the hook runs only when it holds (#327 S4). Blank = always. */
    condition?: string;
};
/**
 * Main settings interface for the ZettelFlow plugin.
 */
export interface ZettelFlowSettings {
    /** Enable or disable logging */
    loggerEnabled: boolean;
    /** Logging level (e.g., "debug", "info", etc.) */
    logLevel: string;
    /** Enable or disable the use of a unique prefix */
    uniquePrefixEnabled: boolean;
    /** Format/string used as a unique prefix (e.g., "YYYYMMDDHHmmss") */
    uniquePrefix: string;
    /** Identifier for the ribbon canvas */
    ribbonCanvas: string;
    /** Identifier for the editor canvas */
    editorCanvas: string;
    /** Path to the folder containing JavaScript libraries */
    jsLibraryFolderPath: string;
    /** Path to the folder where flows are stored */
    foldersFlowsPath: string;
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
    /** Saved "ask your graph" queries (#318 S3) — persisted so a useful query can be re-run. */
    savedGraphQueries?: string[];
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

    /** Event-driven workflows (#150). */
    events: {
        /**
         * Master switch for event-driven execution. OFF by default: with it disabled no vault
         * listeners are armed and no flow can fire on its own — behavior identical to today.
         */
        enabled: boolean;
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
    loggerEnabled: false, // Logging is disabled by default.
    logLevel: "info", // Default log level; must match a key of the logger's level record.
    uniquePrefixEnabled: false, // Unique prefix is disabled by default.
    uniquePrefix: "YYYYMMDDHHmmss", // Default format for unique prefixes.
    ribbonCanvas: "", // No ribbon canvas configured until the user picks one.
    editorCanvas: "", // No editor canvas configured until the user picks one.
    jsLibraryFolderPath: "", // No JS library folder configured by default.
    foldersFlowsPath: "_ZettelFlow/folders", // Default folder for storing flows.
    excludedPaths: [], // Nothing excluded by default — the user opts in (#311).
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
    relations: {}, // parseInlineRelations resolved at runtime: on desktop, off mobile.
    events: { enabled: false }, // Event-driven workflows are opt-in (#150).
    ai: { enabled: false, endpoint: "", apiKey: "", model: "" }, // AI is opt-in, off by default (#156).
    journal: { enabled: true, counts: {} }, // Development-event journal on by default (#162).
    timeline: { enabled: false, snapshots: {} }, // Conceptual evolution timeline opt-in (#168, stores note content).
    patterns: { rerunOnIndex: true }, // Post-index pattern re-run on by default (#200); offline, own keys only.
    history: [],
    hasSeenWelcome: false,
    createInCurrentFolder: false,
    openHomeOnStartup: false, // Off by default; first-run onboarding turns it on for new users (#246 A2).
};
