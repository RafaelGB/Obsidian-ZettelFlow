/** Build the status bar label for an active ZettelFlow wizard session. */
export function formatFlowStatus(canvasName: string, stepName: string): string {
    if (!canvasName && !stepName) return "";
    if (!canvasName) return stepName;
    if (!stepName) return canvasName;
    return `${canvasName} › ${stepName}`;
}
