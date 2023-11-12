import { ZettelFlowElement } from "zettelkasten";
import { WorkflowStep } from "config";
import { OptionType } from "components/select";
import { FlowNode } from "architecture/plugin/canvas/typing";

export class SelectMapper {
    public static zettelFlowElementRecord2Options(steps: WorkflowStep[], nodes: Record<string, ZettelFlowElement>): OptionType[] {
        const options: OptionType[] = [];
        steps.forEach((value) => {
            const node = nodes[value.id];
            options.push({
                label: node.label,
                key: value.id,
                tooltip: node.tooltip,
                color: node.color || "",
                isLeaf: value.children?.length === 0,
                actionTypes: node.actions.map((action) => action.type),
            })
        });
        return options;
    }
    public static flowNodes2Options(nodes: FlowNode[]): OptionType[] {
        const options: OptionType[] = [];
        nodes.forEach((node) => {
            options.push({
                label: node.label || "",
                key: node.id,
                tooltip: node.id,
                color: node.color || "",
                isLeaf: false,
                actionTypes: node.actions.map((action) => action.type),
            })
        });
        return options;
    }
}