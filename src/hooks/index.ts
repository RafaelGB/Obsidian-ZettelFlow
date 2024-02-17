import { FileMenu } from './FileMenu';
import { EditorMenu } from './EditorMenu';
import { VaultHooks } from './VaultHooks';
import { CanvasNodeMenu } from './CanvasNodeMenu';
import ZettelFlow from 'main';


export class Hooks {
    public static setup(plugin: ZettelFlow) {
        FileMenu.setup(plugin);
        EditorMenu.setup(plugin);
        VaultHooks.setup(plugin);
        CanvasNodeMenu.setup(plugin);
    }
}