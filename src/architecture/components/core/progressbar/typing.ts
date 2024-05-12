import { StoreApi, UseBoundStore } from "zustand"

export type ProgressBarType = {
    useProgressBar: UseBoundStore<StoreApi<ProgressBarState>>,
    className?: string[],
    label?: string
}

export type ProgressBarState = {
    value: number,
    elements: number,
    elementsDone: number,
    max: number
}