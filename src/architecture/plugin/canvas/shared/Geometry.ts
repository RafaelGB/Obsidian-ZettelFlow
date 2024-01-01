import { CanvasNodeData } from "obsidian/canvas";

export function isNodeInside(child: CanvasNodeData, potentialParent: CanvasNodeData) {
    return (
        child.x > potentialParent.x &&
        child.y > potentialParent.y &&
        child.x < potentialParent.x + potentialParent.width &&
        child.y < potentialParent.y + potentialParent.height
    )
}   