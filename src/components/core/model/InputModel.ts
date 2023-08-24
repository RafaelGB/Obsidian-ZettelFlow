export type InputType = {
    value?: string,
    placeholder: string,
    onChange?: (value: string) => void
    onKeyDown?: (key: string, currentValue: string) => void
}