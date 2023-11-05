import { ZettelFlowElement } from "zettelkasten";
import { WorkflowStep } from "config";
import { Option } from "components/select";

export class SelectMapper {
    public static zettelFlowElementRecord2Options(steps: WorkflowStep[], nodes: Record<string, ZettelFlowElement>): Option[] {
        const options: Option[] = [];
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
}