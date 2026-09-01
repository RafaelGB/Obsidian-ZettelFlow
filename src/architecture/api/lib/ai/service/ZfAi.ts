import { App } from "obsidian";
import { LibModule } from "../../LibModule";
import { AiService } from "architecture/ai/AiService";
import { proposeCompletion } from "actions/ai/aiActionCore";

/** Options a script can attach to a proposal. */
export interface ProposeOptions {
    /** Short, locale-free descriptor of what is being judged. Defaults to `script`. */
    subject?: string;
    /** The note the verdict is about. Without it the verdict is not recorded — there is no idea. */
    path?: string;
}

/**
 * `zf.ai` (#350) — the **§XII-safe** way for a user script to reach a model.
 *
 * A script could already call any HTTP endpoint itself, so this is not a restriction; it is the path
 * that is *both* easier and correct. It reuses the provider the user already configured — no API key
 * duplicated into a script — and it routes through the same
 * {@link proposeCompletion} as every AI action, which means the completion is shown as a **proposal**
 * and the verdict is recorded. `propose` returns text; it cannot write. The convenient path and the
 * principled path are the same path.
 *
 * There is deliberately no "just give me the completion" variant. Adding one would put a silent-write
 * hole back into the product through the widest door available.
 */
export class ZfAi extends LibModule {
    name = "ai";

    /** `propose` is injectable so the verdict path is testable without opening a modal. */
    constructor(app: App, private propose = proposeCompletion, private gate = () => AiService.getInstance().gate()) {
        super(app);
    }

    create_static_functions(): Promise<void> {
        this.register("available", () => this.gate() === "ready", {
            signature: "() => boolean",
            summary: "Whether an AI provider is enabled and configured.",
        });
        this.register(
            "propose",
            async (prompt: string, opts: ProposeOptions = {}): Promise<string | null> => {
                const outcome = await this.propose(prompt, {
                    subject: opts.subject ?? "script",
                    path: opts.path ?? null,
                });
                if (!outcome || outcome.verdict === "rejected") return null;
                return outcome.text;
            },
            {
                signature: "(prompt: string, opts?: { subject?: string; path?: string }) => Promise<string | null>",
                summary:
                    "Ask the configured model, show the answer as a proposal, and return what you accepted — or null if you rejected or dismissed it.",
            }
        );
        return Promise.resolve();
    }

    protected namespace(): string {
        return "zf.ai";
    }
}

/** Factory used by the API builder. */
export const zfAi = (app: App) => new ZfAi(app);
