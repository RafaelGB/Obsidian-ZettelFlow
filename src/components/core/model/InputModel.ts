export type InputType = {
    placeholder: string,
    className?: string[],
    value?: string,
    onChange?: (value: string) => void
    onKeyDown?: (key: string, currentValue: string) => void
}