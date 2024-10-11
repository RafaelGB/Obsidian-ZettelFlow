import { isObsidianPropertyType, ObsidianPropertyType } from "architecture/plugin";
import { TextInputSuggest } from "./AbstractSuggester";
export class PropertySuggest extends TextInputSuggest<string> {
    private filteredSuggestions: string[] = [];
    constructor(
        public inputEl: HTMLInputElement,
        private properties: Record<string, string>,
        types?: string[]
    ) {
        super(inputEl);
        if (!types) {
            this.filteredSuggestions = Object.keys(properties);
        } else {
            this.setTypes(types);
        }
    }

    getSuggestions(input_str: string): string[] {
        return this.filteredSuggestions.filter((property) =>
            property.toLowerCase().includes(input_str.toLowerCase())
        );
    }

    renderSuggestion(property: string, el: HTMLElement): void {
        el.setText(property);
    }

    selectSuggestion(property: string): void {
        this.inputEl.value = property;
        this.inputEl.trigger("input");
        this.close();
    }

    setTypes(types: string[]): void {
        const filteredTypes = types.filter((type) => {
            return isObsidianPropertyType(type);
        });
        this.filteredSuggestions = Object.entries(this.properties)
            .filter(([_, type]) => filteredTypes.includes(type as ObsidianPropertyType))
            .map(([key, _]) => key);
    }
}