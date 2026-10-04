import { ALL_CULTIVATION_MOVES } from "architecture/knowledge/state";

/**
 * The settings at a glance (#660, epic #659) — pure.
 *
 * Four cards at the top of the tab: what creates your notes, how thinking behaves, whether AI is on,
 * and which hooks run. Each one opens its section. It is derived, never stored, so it cannot drift
 * from the settings it reports.
 *
 * It replaced *What is on right now* (#440), which printed `undefined` for every on/off value: that
 * model returned a locale key and the tab read a value. Here every text is either a key with its
 * arguments or a literal, and the type says which.
 */

/** Words to show: a locale key with its arguments, or a literal such as a canvas name. */
export type GlanceText = { key: string; args?: string[] } | { text: string };

export type GlanceSection = "flows" | "thinking" | "ai" | "automation";

export interface GlanceCard {
    id: "create" | "thinking" | "ai" | "hooks";
    /** The section the card opens. */
    section: GlanceSection;
    labelKey: string;
    /** `on` — doing something; `off` — quiet by choice; `warn` — needs you before it can work. */
    tone: "on" | "off" | "warn";
    value: GlanceText;
    detail: GlanceText;
}

/** The subset the glance reads; everything else in the settings is irrelevant to it. */
export interface GlanceSettings {
    ribbonCanvas?: string;
    ai?: { enabled?: boolean; model?: string; endpoint?: string };
    cultivateFriction?: boolean;
    cultivateMoves?: readonly string[];
    hooks?: { properties?: Record<string, { enabled?: boolean } | undefined> };
}

/** Facts the settings alone cannot tell (they need the vault). */
export interface GlanceContext {
    /** Flows with a role other than the one that creates notes. */
    otherFlows?: number;
}

/** The name a path is known by — the file, not the folders above it. */
function basename(path: string | undefined): string | undefined {
    if (!path?.trim()) return undefined;
    return (path.split("/").pop() ?? path).replace(/\.canvas$/, "");
}

/** The host of an endpoint URL, or nothing when it does not parse. */
function host(endpoint: string | undefined): string | undefined {
    if (!endpoint?.trim()) return undefined;
    try {
        return new URL(endpoint).hostname || undefined;
    } catch {
        return undefined;
    }
}

export function settingsGlance(settings: GlanceSettings, context: GlanceContext = {}): GlanceCard[] {
    const create = basename(settings.ribbonCanvas);
    const others = context.otherFlows ?? 0;
    const moves = (settings.cultivateMoves ?? ALL_CULTIVATION_MOVES).filter((m) =>
        (ALL_CULTIVATION_MOVES as readonly string[]).includes(m)
    ).length;
    const hooks = Object.values(settings.hooks?.properties ?? {});
    const paused = hooks.filter((hook) => hook?.enabled === false).length;
    const active = hooks.length - paused;
    const ai = settings.ai?.enabled === true;
    const model = settings.ai?.model?.trim();

    return [
        {
            id: "create",
            section: "flows",
            labelKey: "settings_glance_create",
            tone: create ? "on" : "warn",
            value: create ? { text: create } : { key: "settings_glance_create_none" },
            detail: !create
                ? { key: "settings_glance_create_none_detail" }
                : others === 0
                  ? { key: "settings_glance_create_only" }
                  : { key: others === 1 ? "settings_glance_create_more_one" : "settings_glance_create_more", args: [String(others)] },
        },
        {
            id: "thinking",
            section: "thinking",
            labelKey: "settings_glance_thinking",
            tone: moves > 0 ? "on" : "off",
            value: { key: "settings_glance_moves", args: [String(moves), String(ALL_CULTIVATION_MOVES.length)] },
            // Deliberate friction is on unless someone turned it off (#338).
            detail: { key: settings.cultivateFriction === false ? "settings_glance_reveals" : "settings_glance_asks" },
        },
        {
            id: "ai",
            section: "ai",
            labelKey: "settings_glance_ai",
            tone: ai ? "on" : "off",
            value: ai
                ? model
                    ? { key: "settings_glance_ai_on_model", args: [model] }
                    : { key: "settings_glance_ai_on" }
                : { key: "settings_glance_off" },
            detail: ai
                ? host(settings.ai?.endpoint)
                    ? { text: host(settings.ai?.endpoint)! }
                    : { key: "settings_glance_ai_no_endpoint" }
                : { key: "settings_glance_ai_off_detail" },
        },
        {
            id: "hooks",
            section: "automation",
            labelKey: "settings_glance_hooks",
            tone: active > 0 ? "on" : "off",
            value: { key: "settings_glance_hooks_active", args: [String(active)] },
            detail: { key: "settings_glance_hooks_paused", args: [String(paused)] },
        },
    ];
}
