export type InputType = {
    placeholder: string,
    autofocus?: boolean,
    disablePlaceHolderLabel?: boolean
    className?: string[],
    value?: string,
    required?: boolean,
    onChange?: (value: string) => void
    onKeyDown?: (key: string, currentValue: string) => void
}