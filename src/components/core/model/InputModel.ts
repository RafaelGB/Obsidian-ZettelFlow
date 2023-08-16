import { ChangeEventHandler } from "react";

export type InputType = {
    value?: string,
    placeholder: string,
    type: "text",
    onChange: ChangeEventHandler<HTMLInputElement>
}