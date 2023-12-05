import { OptionType } from "application/components/select";
import { FlowNode } from "architecture/plugin/canvas/typing";

export class SelectMapper {
    public static flowNodes2Options(nodes: FlowNode[]): OptionType[] {
        const options: OptionType[] = [];
        nodes.forEach((node) => {
            const actions = node.actions ?? [];
            options.push({
                label: node.label || "",
                key: node.id,
                tooltip: node.tooltip,
                color: node.color,
                actionTypes: actions.map((action) => action.type),
            })
        });
        return options;
    }
}