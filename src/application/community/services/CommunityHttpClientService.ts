import { log } from "architecture";
import { CommunityAction, CommunityStepSettings, StaticTemplateOptions } from "config";
import { request } from "obsidian";
import { CommunityFlowData } from "../typing";

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

export async function fetchFlowTemplate(ref: string) {
    log.debug("Fetching flow template", ref);
    const rawList = await request({
        url: `${COMMUNITY_BASE_URL}${ref}/flow.json`,
        method: "GET",
        contentType: "application/json",
    });
    return JSON.parse(rawList) as CommunityFlowData;
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