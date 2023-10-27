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
        const validationMap = [id];

        return {
            id,
            children: this.manageChildren(children, validationMap)
        }
    }
    private manageChildren(childrenParent: ZettelNode[], validationList: string[]): WorkflowStep[] {
        const workflow: WorkflowStep[] = [];
        childrenParent.forEach((node) => {
            const { id } = node;
            if (validationList.contains(id)) {
                workflow.push({
                    id,
                    isRecursive: true
                });
            } else {
                const source = node as ZettelNodeSource;
                this.saveSection(source);
                validationList.push(id);
                workflow.push({
                    id,
                    // Validation list is passed by deep copy to avoid global changes of other branches
                    children: this.manageChildren(source.children, [...validationList])
                });
            }
        });
        return workflow;
    }

    private saveSection(section: ZettelNodeSource) {
        const { id, file, color } = section;
        if (this.sectionMap.has(id)) return;
        const service = FrontmatterService.instance(file);
        const pluginSettings = service.getZettelFlowSettings();
        const defaultInfo: ZettelFlowElement = {
            path: file.path,
            label: file.basename,
            childrenHeader: "",
            color: color,
            element: {
                type: "bridge"
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

            defaultInfo.element = this.manageSectionElement(element);
        }
        this.sectionMap.set(id, defaultInfo);
    }

    private manageSectionElement(potentialElement: unknown): SectionElement {
        if (!ZettelkastenTypeService.isSectionElement(potentialElement)) {
            return {
                type: "bridge"
            }
        }

        if (potentialElement.hasUI === undefined) {
            potentialElement.hasUI = true;
        }

        return potentialElement;
    }
}