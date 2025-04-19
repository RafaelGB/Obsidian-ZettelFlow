import { Action } from "architecture/api";
import { AbstractChain } from "architecture/patterns";
import ZettelFlow from "main";
import { StepSettings } from "zettelkasten";

/**
 * Provides information required by the settings handler.
 */
export type SettingsHandlerInfo = {
    /** DOM element that acts as the container for settings UI */
    containerEl: HTMLElement;
    /** Instance of the main ZettelFlow plugin */
    plugin: ZettelFlow;
    /** Optional chain section for additional settings handling */
    section?: AbstractChain<SettingsHandlerInfo>;
};

export type PropertyHookSettings = {
    /** Script to execute when the property changes */
    script: string;
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
    /** Enable or disable the generation of a table of contents */
    tableOfContentEnabled: boolean;
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
    /** Installed templates divided into steps and actions */
    installedTemplates: InstalledTemplates;
    /** Community-specific settings */
    communitySettings: {
        /** Folder where Markdown templates are stored */
        markdownTemplateFolder: string;
        /** URL for the community service */
        url: string;
        /** Optional authentication token for community resources */
        token?: string;
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

}


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
     * Type of the template: can be "step", "action", or "markdown"
     */
    template_type: "step" | "action" | "markdown";
};

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
    uniquePrefixEnabled: false, // Unique prefix is disabled by default.
    uniquePrefix: "YYYYMMDDHHmmss", // Default format for unique prefixes.
    foldersFlowsPath: "_ZettelFlow/folders", // Default folder for storing flows.
    tableOfContentEnabled: true, // Table of contents is enabled by default.
    installedTemplates: {
        steps: {},   // No step templates are installed by default.
        actions: {}  // No action templates are installed by default.
    },
    communitySettings: {
        url: "http://127.0.0.1:8000", // Default URL for community resources.
        markdownTemplateFolder: "_ZettelFlowMdTemplates", // Default folder for Markdown templates.
    },
    hooks: {
        properties: {}, // No global hooks are defined by default.
        folderFlowPath: "_ZettelFlow/hooks" // Default folder for flow scripts.
    }
};
