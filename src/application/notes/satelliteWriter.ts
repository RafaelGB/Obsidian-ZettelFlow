import { TFile } from "obsidian";
import { log } from "architecture";
// Deep imports on purpose: the `architecture/plugin` barrel is stubbed in tests, and these two
// services are exactly what the write-path harness exercises for real (as main.ts does).
import { FileService } from "architecture/plugin/services/FileService";
import { FrontmatterService } from "architecture/plugin/services/FrontmatterService";
import type { Literal } from "architecture/plugin";
import type { SatellitePlan } from "./satellitePlan";

/**
 * Writing the satellite note (#419, epic #405).
 *
 * The order **is** the failure handling, which is why this function exists rather than three
 * scattered steps:
 *
 * 1. the main note already exists — it is a parameter, so a build that failed to create it **cannot
 *    reach this code at all** (AC-4, by construction rather than by a test);
 * 2. an occupied path aborts before any write (AC-5) — create-only, like the #401 install path;
 * 3. the satellite is created from its own template;
 * 4. the **edge is written last**, so a failed satellite can never leave the main note claiming a
 *    relation to a file that does not exist (AC-3).
 */

export interface SatelliteOutcome {
    status: "created" | "conflict" | "failed";
    path: string;
    error?: string;
}

export async function writeSatellite(
    plan: SatellitePlan,
    mainFile: TFile
): Promise<SatelliteOutcome> {
    const outcome = (status: SatelliteOutcome["status"], error?: string): SatelliteOutcome => ({
        status,
        path: plan.path,
        ...(error ? { error } : {}),
    });

    // 2. Create-only: an existing note is never touched, and nothing else happens either.
    const existing = await FileService.getFile(plan.path, false);
    if (existing) {
        log.warn(`[satellite] ${plan.path} already exists — nothing was written`);
        return outcome("conflict");
    }

    try {
        // 3. The satellite is its template, not a copy of the main note.
        const template = await FileService.getFile(plan.template, false);
        if (!template) {
            return outcome("failed", `template not found: ${plan.template}`);
        }
        const service = FrontmatterService.instance(template);
        const body = await service.getContent();
        const frontmatter = service.getFrontmatter() as Record<string, Literal>;

        const created = await FileService.createFile(plan.path, body, false);
        await FrontmatterService.instance(created).setProperties({ ...frontmatter });

        // 4. The edge, last of all.
        const target = plan.edge.on === "main" ? mainFile : created;
        await FrontmatterService.instance(target).setProperties({
            [plan.edge.key]: plan.edge.value,
        });

        log.info(`[satellite] created ${plan.path} (${plan.edge.key})`);
        return outcome("created");
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(`[satellite] could not create ${plan.path}: ${message}`);
        return outcome("failed", message);
    }
}
