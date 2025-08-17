export class Keyboard {
    /**
     * Closes all modals by simulating an Escape key press.
     * This method will dispatch a keyboard event for the Escape key
     * until no modals are left or a guard limit is reached to prevent infinite loops.
     */
    public static closeAllModalsByEsc(): void {
        const hasModals = () =>
            document.querySelector(".modal-container, .modal-bg") !== null;

        // Prevent infinite loop
        let guard = 25;

        while (hasModals() && guard-- > 0) {
            const evt = new KeyboardEvent("keydown", {
                key: "Escape",
                code: "Escape",
                keyCode: 27,
                which: 27,
                bubbles: true,
                cancelable: true,
            });
            document.dispatchEvent(evt);
        }
    }
}