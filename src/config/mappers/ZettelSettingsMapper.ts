import { CanvasFileTree, FrontmatterService } from "architecture/plugin";
import { TypeService } from "architecture/typing";
import { SectionElement, ZettelFlowElement, ZettelFlowOption, ZettelkastenTypeService } from "zettelkasten";

export function canvasFileTreeArray2rootSection(tree: CanvasFileTree[]): Record<string, ZettelFlowOption> {
    const rootSection: Record<string, ZettelFlowOption> = {};
    tree.forEach((node) => {
        const { file, children } = node;
        const service = FrontmatterService.instance(file);
        const pluginSettings = service.getZettelFlowSettings();
        const metaInfo = {
            label: file.basename,
            targetFolder: "/",
            childrenHeader: "",
        }
        if (TypeService.isObject(pluginSettings)) {
            const { label, targetFolder, childrenHeader } = pluginSettings;
            metaInfo.label = TypeService.isString(label) ? label : metaInfo.label;
            metaInfo.targetFolder = TypeService.isString(targetFolder) ? targetFolder : metaInfo.targetFolder;
            metaInfo.childrenHeader = TypeService.isString(childrenHeader) ? childrenHeader : metaInfo.childrenHeader;
        }
        rootSection[file.path] = {
            ...metaInfo,
            children: canvasFileTreeArray2Children(children)
        }
    });
    return rootSection;
}

function canvasFileTreeArray2Children(tree: CanvasFileTree[]): Record<string, ZettelFlowElement> {
    const record: Record<string, ZettelFlowElement> = {};
    tree.forEach((node) => {
        const { file, children } = node;
        const service = FrontmatterService.instance(file);
        const pluginSettings = service.getZettelFlowSettings();
        const baseInfo: Omit<ZettelFlowElement, "element"> = {
            label: file.basename,
            children: canvasFileTreeArray2Children(children),
            childrenHeader: "",
        }
        if (TypeService.isObject(pluginSettings)) {
            const { label, childrenHeader, element } = pluginSettings;
            const elementInfo: ZettelFlowElement = {
                ...baseInfo,
                label: TypeService.isString(label) ? label : baseInfo.label,
                element: manageSectionElement(element),
                childrenHeader: TypeService.isString(childrenHeader) ? childrenHeader : baseInfo.childrenHeader
            }
            record[file.path] = elementInfo;
        } else {
            record[file.path] = {
                ...baseInfo,
                element: manageSectionElement("")
            }
        }

    });
    return record;
}

function manageSectionElement(potentialElement: unknown): SectionElement {
    if (!ZettelkastenTypeService.isSectionElement(potentialElement)) {
        return {
            type: "bridge"
        }
    }
    return potentialElement;
}