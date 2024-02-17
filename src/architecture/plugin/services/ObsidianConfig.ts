import { log } from "architecture";
import { ObsidianApi } from "../ObsidianAPI";
import { InformedLiteral, Literal } from "../model/FrontmatterModel";

export class ObsidianConfig {
    public static ALL_TYPES: ["text", "number", "date", "datetime", "multitext", "checkbox", "aliases"];
    private static parseMap: Map<string, (literal: InformedLiteral) => InformedLiteral> = new Map([
        [
            "checkbox", (literal: InformedLiteral): InformedLiteral => {
                // Check if its boolean
                if (typeof literal === "boolean") {
                    return literal;
                }
                // If not, return false
                log.warn(`Checkbox type expected boolean, but got ${typeof literal}. Returning false.`);
                return false;
            }
        ],
        [
            "number", (literal: InformedLiteral): InformedLiteral => {
                // Check if its float or int
                return parseFloat(literal.toString());
            }
        ],
        [
            "date", (literal: InformedLiteral): InformedLiteral => {
                if (typeof literal === "string") {
                    return new Date(literal);
                }
                return literal;
            }
        ],
        [
            "datetime", (literal: InformedLiteral): InformedLiteral => {
                if (typeof literal === "string") {
                    return new Date(literal);
                }
                return literal;
            }
        ],
        [
            "multitext", (literal: InformedLiteral): InformedLiteral => {
                // Check if literal is an array
                if (Array.isArray(literal)) {
                    return literal;
                }
                // If not, return it as an array
                log.warn(`Multitext type expected array, but got ${typeof literal}. Returning array with literal.`);
                return [literal];
            }
        ]
    ]);

    public static async getTypes(): Promise<Record<string, string>> {
        const typesFilePath = `${ObsidianApi.vault().configDir}/types.json`;
        // Check if file exists
        if (!await ObsidianApi.vault().adapter.exists(typesFilePath)) {
            return {};
        }
        return JSON.parse(await ObsidianApi.vault().adapter.read(typesFilePath)).types;
    }

    public static parseType(literal: Literal, type: string) {
        // Conditional ward against undefined and null
        if (literal === undefined || literal === null) {
            return literal;
        }

        const parserLambda = this.parseMap.get(type);
        if (parserLambda) {
            return parserLambda(literal);
        }
        // If no parser is found, return the literal
        return literal;
    }
}