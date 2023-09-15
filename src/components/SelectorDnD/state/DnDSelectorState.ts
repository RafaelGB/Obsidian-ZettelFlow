import { create } from "zustand";
import { DnDSelectorState } from "../model/DnDSelectorStateModel";
import { log } from "architecture";

export const useNoteBuilderStore = create<DnDSelectorState>((set, get) => ({
    win: activeWindow,
    actions: {
        onDrop: (dragEntity, dropEntity) => {
            log.trace('onDrop', dragEntity, dropEntity);
        }
    }
}));