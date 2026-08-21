import { ExecuteInfo } from "architecture/api";
import type { KnowledgeActionElement } from "zettelkasten";
import {
    createKnowledgeContext,
    KnowledgeContext,
    KnowledgeSink,
} from "architecture/knowledge/context/KnowledgeContext";
import { readyModel, resolveTargetPath } from "./knowledgeActionCore";

/**
 * Projects a wizard-shaped {@link ExecuteInfo} onto the pure {@link KnowledgeContext} seam (#264).
 * This is the engine-side adapter: the **only** place that resolves the model from the (platform-
 * coupled) `KnowledgeIndex` — via `readyModel()` — and reads identity/frontmatter off `ExecuteInfo`,
 * so the pure context type in the Knowledge layer stays free of any engine/platform dependency.
 *
 * The injected sink replicates `writeKnowledgeResult`'s body byte-for-byte: a frontmatter result is
 * written for **any zone that is not `"context"`** (so `"body"` also reaches frontmatter), and every
 * zone mirrors the value to the `{{key}}` context. Kept single-arg per FR-3 by deriving `el` from
 * `info.element`, exactly as the knowledge/relation actions cast it today.
 */
export function fromExecuteInfo(info: ExecuteInfo): KnowledgeContext {
    const el = info.element as unknown as KnowledgeActionElement;
    const sink: KnowledgeSink = (key, value, zone) => {
        if (!key) return;
        if (zone !== "context") info.content.addFrontMatter({ [key]: value });
        info.context[key] = value;
    };
    return createKnowledgeContext({
        identity: resolveTargetPath(info, el),
        frontmatter: info.content.getFrontmatter(),
        model: readyModel(),
        sink,
    });
}
