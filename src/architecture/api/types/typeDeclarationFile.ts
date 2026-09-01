import { normalizePath } from "obsidian";
import { FileService } from "architecture/plugin/services/FileService";
import { ObsidianApi, log } from "architecture";
import { fnsManager, describeApi } from "../lib/FnConstructor";
import { LIBRARY_SCRIPT_BINDINGS } from "../bindings/scriptBindings";
import { generateTypeDeclarations, type DynamicNamespaces } from "./generateTypes";
import type { ZettelFlowApp } from "../lib/typing";

/** The file written into the JS-library folder. */
export const TYPES_FILENAME = "zettelflow.d.ts";

/**
 * Write `zettelflow.d.ts` into the user's JS-library folder (#352), so an editor outside Obsidian knows
 * the `zf` API while they work on library scripts.
 *
 * Generated on demand rather than shipped with the plugin, because half of what it declares only exists
 * in *this* vault: the functions the user wrote, and whichever integrations they installed.
 */

/** Where the declarations belong, or `null` when no library folder is configured. */
export function typeDeclarationPath(jsLibraryFolderPath: string): string | null {
    const folder = (jsLibraryFolderPath ?? "").trim().replace(/^\/+|\/+$/g, "");
    if (folder === "") return null;
    // The folder is the user's own setting; normalising keeps the write inside it regardless.
    return normalizePath(`${folder}/${TYPES_FILENAME}`);
}

/** What only the live API knows: the user's own scripts, and which integrations are present. */
export function dynamicNamespaces(zf: ZettelFlowApp): DynamicNamespaces {
    return {
        userScripts: Object.keys(zf.internal?.user ?? {}),
        dataview: Boolean(zf.external?.dv),
        templater: Boolean(zf.external?.tp),
    };
}

export type WriteTypesResult =
    | { status: "written"; path: string }
    | { status: "no-folder" }
    | { status: "error"; message: string };

/** Generate and write the declarations. Never throws: the caller reports the result to the user. */
export async function writeTypeDeclarations(): Promise<WriteTypesResult> {
    try {
        const settings = ObsidianApi.getOwnPlugin().settings;
        const path = typeDeclarationPath(settings.jsLibraryFolderPath);
        if (!path) return { status: "no-folder" };

        const zf = await fnsManager.getFns();
        const source = generateTypeDeclarations(
            describeApi(),
            LIBRARY_SCRIPT_BINDINGS,
            dynamicNamespaces(zf)
        );

        await FileService.writeFile(path, source, false);
        return { status: "written", path };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(`[api] could not write ${TYPES_FILENAME}: ${message}`);
        return { status: "error", message };
    }
}
