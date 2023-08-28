import { ZettelFlowOption, ZettelFlowElement } from "zettelkasten";
import { Option } from "components/core";

export class SelectMapper {
    public static zettelFlowOptionRecord2Options(record: Record<string, ZettelFlowOption>): Option[] {
        const options: Option[] = [];
        Object.entries(record).forEach(([key, value]) => {
            options.push({
                label: value.label,
                key: key,
                color: value.element.color || ""
            })
        });
        return options;
    }

    public static ZettelFlowElement2Options(record: Record<string, ZettelFlowElement>): Option[] {
        const options: Option[] = [];
        Object.entries(record).forEach(([key, value]) => {
            options.push({
                label: value.label,
                key: key,
                color: value.element.color || ""
            })
        });
        return options;
    }
}