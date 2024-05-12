import { create } from "zustand";
import { ProgressBarState } from "../typing";

export const initProgressBar = (totalElements: number) => create<ProgressBarState>(set => ({
    value: 0,
    max: 100,
    elements: totalElements,
    elementsDone: 0,
    actions: {
        /**
         * calculate the percentage of elements done and update the value of the progress bar
         * @returns 
         */
        finishElement: () => {
            set(state => {
                const { elementsDone, elements } = state;
                const newValue = (elementsDone + 1) / elements * 100;
                return {
                    value: newValue,
                    elementsDone: elementsDone + 1
                }
            });
        }
    }
}));