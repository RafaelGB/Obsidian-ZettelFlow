import { ZettelFlowOption } from "zettelcaster";
import { Option } from "components/core";

export function zettelFlowOptionRecord2Options(record: Record<string, ZettelFlowOption>): Option[] {
    const options: Option[] = [];
    Object.entries(record).forEach(([key, value]) => {
        options.push({
            label: value.label,
            key: key
        })
    });
    console.log(options);
    return options;
}