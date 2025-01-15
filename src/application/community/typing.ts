import ZettelFlow from "main";
import { StepSettings } from "zettelkasten";

export type CommunityStep = {
    title: string;
    description: string;
} & StepSettings;

export type PluginComponentProps = {
    plugin: ZettelFlow;
}