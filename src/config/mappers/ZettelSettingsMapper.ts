import { Action } from "architecture/api";
import { FrontmatterService, YamlService, ZettelNode } from "architecture/plugin";
import { TypeService } from "architecture/typing";
import { WorkflowStep } from "config";
import { Notice } from "obsidian";
import { StepSettings, ZettelFlowElement, ZettelkastenTypeService } from "zettelkasten";

export class ZettelSettingsMapper {
    private sectionMap: Map<string, ZettelFlowElement>;
    public static instance(nodes: ZettelNode[]) {
        return new ZettelSettingsMapper(nodes);
    }
    private constructor(private nodes: ZettelNode[]) {
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

    private manageWorkflow(node: ZettelNode): WorkflowStep {
        const { id, children = [] } = node;
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
                const { children = [] } = node;
                this.saveSection(node);
                validationList.push(id);
                workflow.push({
                    id,
                    // Validation list is passed by deep copy to avoid global changes of other branches
                    children: this.manageChildren(children, [...validationList])
                });
            }
        });
        return workflow;
    }

    private saveSection(section: ZettelNode) {
        const { id, file, text, type, color, tooltip } = section;
        if (this.sectionMap.has(id)) return;
        if (!file && !text) return;

        const defaultInfo: ZettelFlowElement = {
            type,
            label: "",
            childrenHeader: "",
            color: color,
            tooltip: tooltip,
            actions: [],
        };
        let step: StepSettings;
        if (file) {
            const service = FrontmatterService.instance(file);
            defaultInfo.path = file.path;
            defaultInfo.label = file.basename;
            step = service.getZettelFlowSettings();
        }
        else if (text) {
            defaultInfo.yaml = text;
            const service = YamlService.instance(text);
            step = service.getZettelFlowSettings();
            defaultInfo.yaml = text;
            defaultInfo.label = step.label || "Untitled";
        }
        else {
            return;
        }
        if (TypeService.isObject(step)) {
            const { label, targetFolder, childrenHeader, actions = [], optional } = step;
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