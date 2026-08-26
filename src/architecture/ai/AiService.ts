import { ObsidianApi } from "architecture/plugin/ObsidianAPI";
import { AiProvider } from "./AiProvider";
import { aiGateDecision, AiGateState, AiSettings } from "./aiGate";
import { OpenAiCompatibleProvider } from "./OpenAiCompatibleProvider";

/**
 * Runtime entry point for the optional AI category (#156). Reads the opt-in `ai` settings, exposes
 * the {@link aiGateDecision} gate, and builds the OpenAI-compatible provider from the current
 * config. `getInstance()` singleton, matching the rest of the runtime.
 */
export class AiService {
    private static instance: AiService;

    public static getInstance(): AiService {
        if (!AiService.instance) AiService.instance = new AiService();
        return AiService.instance;
    }

    private settings(): AiSettings {
        return ObsidianApi.getOwnPlugin().settings.ai;
    }

    /** The current AI settings (read-only use) — for input/output caps and the automations gate (#301). */
    public config(): AiSettings {
        return this.settings();
    }

    /** The current gate state — `disabled` (off), `unconfigured`, or `ready`. */
    public gate(): AiGateState {
        return aiGateDecision(this.settings());
    }

    /** A provider built from the current settings. Only call when {@link gate} is `ready`. */
    public getProvider(): AiProvider {
        return new OpenAiCompatibleProvider(this.settings());
    }
}
