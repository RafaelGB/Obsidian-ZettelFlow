import { SectionElement, TypeOption } from "zettelkasten";

export class ZettelkastenTypeService {
    public static isSectionType(value: any): value is TypeOption {
        return value && typeof value === "string" && (value === "bridge" || value === "prompt");
    }

    public static isSectionElement(value: any): value is SectionElement {
        return value && typeof value === "object" && ZettelkastenTypeService.isSectionType(value.type);
    }
}