import { CanvasFileTree, FrontmatterService } from "architecture/plugin";
import { TypeService } from "architecture/typing";
import { ZettelFlowElement, ZettelFlowOption } from "zettelkasten";

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
        const frontmatter = service.getFrontmatter();
        rootSection[file.path] = {
            ...metaInfo,
            frontmatter: TypeService.isObject(frontmatter) ? frontmatter : {},
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
        const metaInfo = {
            label: file.basename,
            element: {
                type: "selector"
            },
            childrenHeader: "",
        }
        if (TypeService.isObject(pluginSettings)) {
            const { label, type, childrenHeader } = pluginSettings;
            metaInfo.label = TypeService.isString(label) ? label : metaInfo.label;
            metaInfo.element.type = TypeService.isString(type) ? type : metaInfo.element.type;
            metaInfo.childrenHeader = TypeService.isString(childrenHeader) ? childrenHeader : metaInfo.childrenHeader;
        }
        const frontmatter = service.getFrontmatter();
        record[file.path] = {
            ...metaInfo,
            frontmatter: TypeService.isObject(frontmatter) ? frontmatter : {},
            children: canvasFileTreeArray2Children(children)
        }
    });
    return record;
}