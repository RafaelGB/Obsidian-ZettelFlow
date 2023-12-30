import { parseYaml, stringifyYaml } from "obsidian";
import { StepSettings } from "zettelkasten";

export class YamlService {
    private yaml: StepSettings;
    public static instance(yamlString: string) {
        return new YamlService(yamlString);
    }

    constructor(yamlString: string | undefined) {
        if (!yamlString) {
            this.yaml = {
                root: true,
                actions: [],
                label: "" // Add the 'label' property with an empty string value
            }
        } else {
            this.yaml = parseYaml(yamlString)
        }
    }

    public isRoot(): boolean {
        return this.yaml.root === true;
    }

    public stringify(): string {
        return stringifyYaml(this.yaml);
    }

    public getZettelFlowSettings(): StepSettings {
        return this.yaml;
    }
}