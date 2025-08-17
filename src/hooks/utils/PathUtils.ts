/** Reemplaza barras por guiones bajos como hace el código original. */
export function normalizeFolderToCanvasName(folderPath: string): string {
    return folderPath.replace(/\//g, "_");
}

export function canvasPathFromFolder(
    foldersFlowsPath: string,
    folderPath: string
): string {
    return `${foldersFlowsPath}/${normalizeFolderToCanvasName(folderPath)}.canvas`;
}

/** Acepta nombre con o sin extensión y devuelve la ruta final .canvas */
export function canvasPathFromFlowName(
    hooksFolderFlowPath: string,
    flowName: string
): string {
    const clean = flowName.endsWith(".canvas")
        ? flowName.slice(0, -".canvas".length)
        : flowName;
    return `${hooksFolderFlowPath}/${clean}.canvas`;
}
