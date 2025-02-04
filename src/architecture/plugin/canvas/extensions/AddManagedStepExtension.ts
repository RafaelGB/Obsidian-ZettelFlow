import { Canvas, Position } from "obsidian/canvas";
import CanvasExtension from "./CanvasExtension";
import CanvasHelper from "./utils/CanvasHelper";

const GROUP_NODE_SIZE = { width: 300, height: 300 }

export default class AddManagedStepExtension extends CanvasExtension {
    isEnabled() { return true }

    init() {
        this.plugin.registerEvent(this.plugin.app.workspace.on(
            "zettelflow-node-connection-drop-menu",
            (canvas: Canvas) => {
                CanvasHelper.addCardMenuOption(
                    canvas,
                    CanvasHelper.createCardMenuOption(
                        canvas,
                        {
                            id: 'create-group',
                            label: 'Drag to add group',
                            icon: 'group'
                        },
                        () => GROUP_NODE_SIZE,
                        (canvas: Canvas, pos: Position) => {
                            canvas.createGroupNode({
                                pos: pos,
                                size: GROUP_NODE_SIZE
                            })
                        }
                    )
                )
            }
        ))
    }
}