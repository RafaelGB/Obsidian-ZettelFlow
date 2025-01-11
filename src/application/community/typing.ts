import { StepSettings } from "zettelkasten";

export type CommunityStep = {
    title: string;
    description: string;
} & StepSettings;