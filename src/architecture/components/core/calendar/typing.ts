export type CalendarType = {
    onConfirm: (date: string) => void,
    enableTime?: boolean,
    className?: string[],
}