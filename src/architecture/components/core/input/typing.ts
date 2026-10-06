export type InputType = {
    placeholder: string,
    /** A visible label above the field (#684); without one the placeholder names the field. */
    label?: string,
    autofocus?: boolean,
    /** Draws no placeholder text at all — for a host that labels the field itself. */
    disablePlaceHolderLabel?: boolean
    className?: string[],
    value?: string,
    required?: boolean,
    onChange?: (value: string) => void
    onKeyDown?: (event: React.KeyboardEvent<HTMLElement>, currentValue: string) => void
}
