import { CanvasNodeData } from "obsidian/canvas";

export function isNodeInside(child: CanvasNodeData, potentialParent: CanvasNodeData) {
    return (
        child.x > potentialParent.x &&
        child.y > potentialParent.y &&
        child.x < potentialParent.x + potentialParent.width &&
        child.y < potentialParent.y + potentialParent.height
    )
}

export function findDirectChildren(node: CanvasNodeData, allNodes: CanvasNodeData[]) {
    // Find all children that are inside the group
    let directChildren = allNodes.filter(child => isNodeInside(child, node));

    // Filter out children that are inside other children
    directChildren.forEach(child => {
        if (child.type === "group") {
            // Recursively find all children of the child group
            const subChildren = findDirectChildren(child, allNodes);
            directChildren = directChildren.filter(directChild => !subChildren.includes(directChild));
        }
    });

    return directChildren;
}