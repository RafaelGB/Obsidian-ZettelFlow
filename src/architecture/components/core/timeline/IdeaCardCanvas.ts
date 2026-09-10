import type { IdeaCard } from "architecture/knowledge/state";
import { t } from "architecture/lang";

/** Direction → i18n key, as literal keys so the locale-usage guard sees them (no composed prefix). */
const DIRECTION_KEYS: Record<string, Parameters<typeof t>[0]> = {
    advancing: "idea_card_direction_advancing",
    steady: "idea_card_direction_steady",
    stalled: "idea_card_direction_stalled",
};

/**
 * Paint an {@link IdeaCard} onto a 2D canvas (#387, B4) — the exact pixels shown in the preview *and*
 * saved as PNG (one paint routine, reused by A3's export path). Fixed dark palette so the card reads the
 * same whatever the theme; no `el.style`, no DOM — just the Canvas 2D API. Manual-verified (jsdom can't
 * rasterize). Returns the canvas for the caller to capture.
 */

export const IDEA_CARD_WIDTH = 1200;
export const IDEA_CARD_HEIGHT = 630;

const COLORS = {
    bg: "#0b0e14",
    panel: "#161b26",
    border: "rgba(255,255,255,0.10)",
    title: "#e8eaed",
    muted: "#aeb6c4",
    faint: "#8b93a7",
    accent: "#22d3ee",
    good: "#4ade80",
    arrow: "#60a5fa",
};

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

/** Draw a "Before"/"After" panel with a label and a big state word. */
function statePanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, label: string, state: string, claims: number): void {
    ctx.fillStyle = COLORS.panel;
    roundRect(ctx, x, y, w, h, 16);
    ctx.fill();
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.faint;
    ctx.font = "600 22px sans-serif";
    ctx.fillText(label.toUpperCase(), x + w / 2, y + 48);

    ctx.fillStyle = COLORS.accent;
    ctx.font = "700 44px sans-serif";
    ctx.fillText(state || "—", x + w / 2, y + h / 2 + 16);

    ctx.fillStyle = COLORS.muted;
    ctx.font = "400 22px sans-serif";
    ctx.fillText(t("idea_card_claims_count", String(claims)), x + w / 2, y + h - 34);
}

export function paintIdeaCard(canvas: HTMLCanvasElement, card: IdeaCard): HTMLCanvasElement {
    canvas.width = IDEA_CARD_WIDTH;
    canvas.height = IDEA_CARD_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;

    const W = IDEA_CARD_WIDTH;
    const pad = 64;

    // Background.
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, IDEA_CARD_HEIGHT);

    // Header.
    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.muted;
    ctx.font = "600 24px sans-serif";
    ctx.fillText(t("idea_card_kicker"), pad, pad + 8);

    ctx.fillStyle = COLORS.title;
    ctx.font = "700 52px sans-serif";
    ctx.fillText(truncate(ctx, card.title, W - pad * 2), pad, pad + 68);

    // Before → After panels.
    const panelY = 200;
    const panelH = 200;
    const gap = 90;
    const panelW = (W - pad * 2 - gap) / 2;
    statePanel(ctx, pad, panelY, panelW, panelH, t("idea_card_before_label"), card.firstState, card.claimsFirst);
    statePanel(ctx, pad + panelW + gap, panelY, panelW, panelH, t("idea_card_after_label"), card.currentState, card.claimsCurrent);

    // Arrow between the panels.
    ctx.fillStyle = COLORS.arrow;
    ctx.font = "700 64px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("→", W / 2, panelY + panelH / 2 + 20);

    // Stats strip.
    const stats: string[] = [];
    if (card.claimsGained > 0) stats.push(t("idea_card_stat_claims", String(card.claimsGained)));
    stats.push(t("idea_card_stat_links", String(card.linksNow)));
    stats.push(t("idea_card_stat_decisions", String(card.milestoneCount)));
    stats.push(t("idea_card_stat_days", String(card.elapsedDays)));

    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.good;
    ctx.font = "600 30px sans-serif";
    ctx.fillText(stats.join("   ·   "), W / 2, 480);

    // Direction line, when known.
    const directionKey = card.direction ? DIRECTION_KEYS[card.direction] : undefined;
    if (directionKey) {
        ctx.fillStyle = COLORS.muted;
        ctx.font = "400 26px sans-serif";
        ctx.fillText(t(directionKey), W / 2, 528);
    }

    // Footer brand.
    ctx.textAlign = "right";
    ctx.fillStyle = COLORS.faint;
    ctx.font = "600 22px sans-serif";
    ctx.fillText("ZettelFlow", W - pad, IDEA_CARD_HEIGHT - 40);

    return canvas;
}

/** Trim `text` with an ellipsis so it fits within `maxWidth` at the current font. */
function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let trimmed = text;
    while (trimmed.length > 1 && ctx.measureText(trimmed + "…").width > maxWidth) {
        trimmed = trimmed.slice(0, -1);
    }
    return trimmed + "…";
}
