import { OptionType } from "application/components/select";
import { FlowNode } from "architecture/plugin/canvas/typing";
import { describeOption } from "application/notes/optionDescription";

export class SelectMapper {
    public static flowNodes2Options(nodes: FlowNode[]): OptionType[] {
        const options: OptionType[] = [];
        nodes.forEach((node) => {
            const actions = node.actions ?? [];
            options.push({
                label: node.label || "",
                key: node.id,
                // The edge label is also the gate; a person reads only its human half (#423).
                tooltip: describeOption(node.tooltip),
                color: node.color,
                actionTypes: actions.map((action) => action.type),
                phase: node.phase,
            })
        });
        return options;
    }
}