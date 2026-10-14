import { log } from "architecture";
import { CommunityAction, CommunityStepSettings, StaticTemplateOptions } from "config";
import { request } from "obsidian";
import { ZfTemplate, parseTemplate } from "application/template/zfTemplate";

export const COMMUNITY_BASE_URL =
    "https://raw.githubusercontent.com/RafaelGB/Obsidian-ZettelFlow/refs/heads/main";

export async function fetchCommunityTemplates(): Promise<StaticTemplateOptions[]> {
    log.debug("Fetching community templates");
    const rawList = await request({
        url: `${COMMUNITY_BASE_URL}/docs/main_template.json`,
        method: "GET",
        contentType: "application/json",
    });
    return JSON.parse(rawList) as StaticTemplateOptions[];
}

export async function fetchActionTemplate(ref: string) {
    log.debug("Fetching action template", ref);
    const rawList = await request({
        url: `${COMMUNITY_BASE_URL}${ref}`,
        method: "GET",
        contentType: "application/json",
    });
    return JSON.parse(rawList) as CommunityAction;
}

export async function fetchStepTemplate(ref: string) {
    log.debug("Fetching step template", ref);
    const rawList = await request({
        url: `${COMMUNITY_BASE_URL}${ref}`,
        method: "GET",
        contentType: "application/json",
    });
    return JSON.parse(rawList) as CommunityStepSettings;
}

/**
 * One GET per system per session (#799): the card draws it and the panel walks it, so both share the
 * same fetch. A failure is forgotten at once, so *Try again* asks again.
 */
const systemTemplates = new Map<string, Promise<ZfTemplate>>();

export function fetchSystemTemplate(ref: string): Promise<ZfTemplate> {
    const known = systemTemplates.get(ref);
    if (known) return known;
    log.debug("Fetching system template", ref);
    const fetching = request({
        url: `${COMMUNITY_BASE_URL}${ref}`,
        method: "GET",
        contentType: "application/json",
    }).then(parseTemplate);
    systemTemplates.set(ref, fetching);
    fetching.catch(() => systemTemplates.delete(ref));
    return fetching;
}

/** Forget every fetched system — a test's fresh session. */
export function forgetSystemTemplates(): void {
    systemTemplates.clear();
}

export async function fetchMarkdownTemplate(ref: string) {
    log.debug("Fetching markdown template", ref);
    const markdown = await request({
        url: `${COMMUNITY_BASE_URL}${ref}`,
        method: "GET",
        contentType: "text/plain",
    });
    return markdown;
}