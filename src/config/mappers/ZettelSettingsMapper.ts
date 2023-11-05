import { Action } from "architecture/api";
import { FrontmatterService, ZettelNode, ZettelNodeSource } from "architecture/plugin";
import { TypeService } from "architecture/typing";
import { WorkflowStep } from "config";
import { Notice } from "obsidian";
import { ZettelFlowElement, ZettelkastenTypeService } from "zettelkasten";

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
        const { id, file, color, tooltip } = section;
        if (this.sectionMap.has(id)) return;
        const service = FrontmatterService.instance(file);
        const step = service.getZettelFlowSettings();
        const defaultInfo: ZettelFlowElement = {
            path: file.path,
            label: file.basename,
            childrenHeader: "",
            color: color,
            tooltip: tooltip,
            actions: [],
        };
        if (TypeService.isObject(step)) {
            const { label, targetFolder, childrenHeader, element, actions = [], optional } = step;
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
            // LEGACY COMPATIBILITY START
            if (actions.length === 0 && element && element.type !== "bridge") {
                actions.push(element);
            }
            // LEGACY COMPATIBILITY END
            defaultInfo.actions = this.manageActions(actions);
        }
        this.sectionMap.set(id, defaultInfo);
    }

    private manageActions(actions: Action[]): Action[] {
        if (!actions) return [];

        return actions.map((action) => {
            return this.manageAction(action);
        });
    }
    private manageAction(potentialAction: unknown): Action {
        if (!ZettelkastenTypeService.isSectionElement(potentialAction)) {
            new Notice(`Invalid action found: ${JSON.stringify(potentialAction)}`);
            throw new Error("Invalid action found");
        }


        if (potentialAction.hasUI === undefined) {
            potentialAction.hasUI = true;
        }

        return potentialAction;
    }
}