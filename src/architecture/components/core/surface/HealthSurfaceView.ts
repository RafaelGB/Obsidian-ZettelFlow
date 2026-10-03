import { ModeHostView } from "./ModeHostView";
import { KnowledgeModeRenderer } from "./KnowledgeModeRenderer";
import { TendRenderer } from "architecture/components/core/tend/TendRenderer";
import { PracticeRenderer } from "architecture/components/core/practice/PracticeRenderer";

/**
 * The **Health** surface (#272) — the two vault questions worth a room (epic #639): **Tend**, which
 * notes need you, each handed to This note on its fix (#644), and **Practice**, what you have been
 * doing — Momentum and Agency merged (#645). A note's own history left for the right sidebar as
 * This note (#640).
 */
export class HealthSurfaceView extends ModeHostView {
    getViewType(): string {
        return "zettelflow-health";
    }

    getIcon(): string {
        return "stethoscope";
    }

    protected createRenderer(modeId: string, container: HTMLElement): KnowledgeModeRenderer {
        switch (modeId) {
            case "practice":
                return new PracticeRenderer(container, this.app);
            case "tend":
            default:
                return new TendRenderer(container, this.app);
        }
    }
}
