import { FrontmatterService, ZettelNode, ZettelNodeSource } from "architecture/plugin";
import { TypeService } from "architecture/typing";
import { WorkflowStep } from "config";
import { HexString } from "obsidian";
import { SectionElement, ZettelFlowElement, ZettelkastenTypeService } from "zettelkasten";

export class ZettelSettingsMapper {
    private sectionMap: Map<string, ZettelFlowElement>;
    public static instance(nodes: ZettelNodeSource[]) {
        return new ZettelSettingsMapper(nodes);
    }
    private constructor(private nodes: ZettelNodeSource[]) {
        this.sectionMap = new Map();
    }

    public marshall() {
        const workflow: WorkflowStep[] = [];
        this.nodes.forEach((node) => {
            workflow.push(this.manageWorkflow(node));
        });
        const sectionMap = this.sectionMap;
        return { sectionMap, workflow };
    }

    private manageWorkflow(node: ZettelNodeSource): WorkflowStep {
        const { id, children } = node;
        this.saveSection(node);
        return {
            id,
            children: this.manageChildren(children)
        }
    }
    private manageChildren(childrenParent: ZettelNode[]): WorkflowStep[] {
        const workflow: WorkflowStep[] = [];
        childrenParent.forEach((node) => {
            const { id } = node;
            if (this.sectionMap.has(id)) {
                workflow.push({
                    id,
                    isRecursive: true
                });
            } else {
                const source = node as ZettelNodeSource;
                this.saveSection(source);
                workflow.push({
                    id,
                    children: this.manageChildren(source.children)
                });
            }
        });
        return workflow;
    }

    private saveSection(section: ZettelNodeSource) {
        const { id, file, color } = section;
        const service = FrontmatterService.instance(file);
        const pluginSettings = service.getZettelFlowSettings();
        const defaultInfo: ZettelFlowElement = {
            path: file.path,
            label: file.basename,
            childrenHeader: "",
            element: {
                type: "bridge",
                color: color
            }
        }
        if (TypeService.isObject(pluginSettings)) {
            const { label, targetFolder, childrenHeader, element, optional } = pluginSettings;
            if (TypeService.isString(label)) {
                defaultInfo.label = label;
            }

            if (TypeService.isString(targetFolder)) {
                defaultInfo.targetFolder = targetFolder;
            }

            if (TypeService.isString(childrenHeader)) {
                defaultInfo.childrenHeader = childrenHeader;
            }

            if (TypeService.isBoolean(optional)) {
                defaultInfo.optional = optional;
            }

            defaultInfo.element = this.manageSectionElement(element, color);
        }
        this.sectionMap.set(id, defaultInfo);
    }

    private manageSectionElement(potentialElement: unknown, color: HexString | undefined): SectionElement {
        if (!ZettelkastenTypeService.isSectionElement(potentialElement)) {
            return {
                type: "bridge",
                color: color
            }
        }
        return {
            ...potentialElement,
            color: color
        }
    }
}