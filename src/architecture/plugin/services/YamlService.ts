import { parseYaml, stringifyYaml } from "obsidian";
import { StepSettings } from "zettelkasten";

export class YamlService {
    private yaml: any;
    public static instance(yamlString: string) {
        return new YamlService(yamlString);
    }

    constructor(yamlString: string) {
        this.yaml = parseYaml(yamlString)
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