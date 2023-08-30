import { ZettelFlowElement } from "zettelkasten";
import { Option } from "components/core";
import { WorkflowStep } from "config";

export class SelectMapper {
    public static zettelFlowElementRecord2Options(steps: WorkflowStep[], nodes: Record<string, ZettelFlowElement>): Option[] {
        const options: Option[] = [];
        steps.forEach((value) => {
            const node = nodes[value.id];
            options.push({
                label: node.label,
                key: value.id,
                color: node.element.color || ""
            })
        });
        return options;
    }
}