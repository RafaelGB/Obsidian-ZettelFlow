import { PluginComponent } from "architecture";
import { log } from "architecture";
import { t } from "architecture/lang";
import { Flow, canvas } from "architecture/plugin/canvas";
import ZettelFlow from "main";
import { addIcon } from "obsidian";
import { SelectorMenuModal } from "zettelkasten";

export class RibbonIcon extends PluginComponent {
    public static ID = 'zettelflow-ribbon-icon';
    public static BRIDGE = 'zettelflow-bridge-icon';
    public static LEAF = 'zettelflow-leaf-icon';
    public static TEMPLATE = 'zettelflow-template-icon';
    public static ACTION = 'zettelflow-action-icon';
    private ribbonTitle = 'Create a new Zettel Note';
    constructor(private plugin: ZettelFlow) {
        super(plugin);
    }

    onLoad(): void {
        addIcon(RibbonIcon.ID, `
            <g transform="translate(0,90) scale(3.5,-3.5)"
            fill="currentColor"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round">

            <rect x="1"  y="2"  width="10" height="7"  fill="none" />
            <rect x="1"  y="17" width="10" height="7"  fill="none" />
            <rect x="18" y="9"  width="10" height="7"  fill="none" />

            <line x1="6"   y1="9"   x2="6"   y2="17"   />
            <line x1="11"  y1="5.5" x2="18"  y2="12.5" />
            <line x1="11"  y1="20.5"x2="18"  y2="12.5" />
            </g>
        `);
        addIcon(RibbonIcon.BRIDGE, `<g transform="translate(-15,125) scale(0.025,-0.025)" stroke="none"> <path d="M640 2875 l0 -745 -215 0 -215 0 0 -210 0 -210 215 0 215 0 0 -215 0 -215 215 0 215 0 0 215 0 215 1490 0 1490 0 0 -215 0 -215 215 0 215 0 0 215 0 215 215 0 215 0 0 210 0 210 -215 0 -215 0 0 745 0 745 -215 0 -215 0 0 -152 0 -153 -78 -61 c-238 -188 -531 -331 -836 -409 -211 -53 -343 -69 -576 -69 -233 0 -365 16 -576 69 -304 78 -591 219 -841 414 l-72 56 -1 153 0 152 -215 0 -215 0 0 -745z m556 83 c60 -40 151 -93 202 -118 l92 -44 0 -333 0 -333 -210 0 -210 0 0 456 c0 250 3 453 8 451 4 -3 57 -38 118 -79z m2854 -373 l0 -455 -210 0 -210 0 0 333 1 332 91 45 c97 47 203 111 277 167 24 18 45 33 47 33 2 0 4 -205 4 -455z m-2221 80 c48 -14 134 -36 191 -49 l105 -23 3 -232 2 -231 -210 0 -210 0 0 286 c0 261 1 286 16 280 9 -4 56 -18 103 -31z m1581 -250 l0 -285 -210 0 -210 0 2 232 3 232 45 9 c71 13 271 65 315 81 22 8 43 15 48 15 4 1 7 -127 7 -284z m-640 -67 l0 -218 -210 0 -210 0 0 218 0 217 210 0 210 0 0 -217z"/></g>`);
        addIcon(RibbonIcon.LEAF, '<g transform="translate(-15,110) scale(0.50,-0.50)" stroke="none"> <path d="M113 205 c-73 -31 -100 -86 -68 -132 10 -14 12 -24 5 -28 -13 -8 -13 -25 -1 -25 16 0 73 62 87 95 10 22 13 25 13 10 0 -11 -6 -31 -14 -45 -8 -14 -14 -31 -15 -37 0 -22 40 -14 67 13 22 22 25 32 20 70 -5 47 -30 94 -50 94 -6 -1 -27 -7 -44 -15z" /></g>');
        addIcon(RibbonIcon.TEMPLATE, '<g transform = "translate(-10,110) scale(0.115,-0.115)" stroke = "none" > <path d="M84 907 c-2 -7 -3 -60 -2 -118 l3 -104 415 0 415 0 0 115 0 115 -413 3 c -336 2 -413 0 -418 -11z m796 -107 l0 -80 -380 0 -380 0 0 80 0 80 380 0 380 0 0 -80z" /> <path d="M85 628 c-3 -8 -4 -132 -3 -278 l3 -265 255 0 255 0 0 275 0 275 -253 3 c -198 2 -254 0 -257 -10z m475 -268 l0 -240 -220 0 -220 0 0 240 0 240 220 0 220 0 0 -240z"/> <path d="M644 627 c-3 -8 -4 -43 -2 -78 l3 -64 135 0 135 0 0 75 0 75 -133 3c -105 2 -133 0 -138 -11z m236 -67 l0 -40 -100 0 -100 0 0 40 0 40 100 0 100 0 0 -40z" /> <path d="M644 427 c-3 -8 -4 -43 -2 -78 l3 -64 135 0 135 0 0 75 0 75 -133 3c -105 2 -133 0 -138 -11z m236 -67 l0 -40 -100 0 -100 0 0 40 0 40 100 0 100 0 0 -40z" /><path d="M644 227 c-3 -8 -4 -43 -2 -78 l3 -64 135 0 135 0 0 75 0 75 -133 3c -105 2 -133 0 -138 -11z m236 -67 l0 -40 -100 0 -100 0 0 40 0 40 100 0 100 0 0 -40z"/></g>');
        addIcon(RibbonIcon.ACTION, '<g transform = "translate(-10,120) scale(0.135,-0.135)" stroke = "none"><path d="M807 862 c-16 -17 -15 -20 11 -45 28 -27 29 -27 46 -8 10 11 16 30 14 43 -4 30 -47 37 -71 10z" /><path d="M614 667 c-174 -176 -216 -246 -132 -218 22 7 87 65 186 164 l153 153 -29 27 -28 27 -150 -153z"/> <path d="M195 765 l-25 -24 0 -261 0 -261 25 -24 24 -25 261 0 261 0 24 25 25 24 0 222 0 223 -30 -29 -30 -29 0 -188 0 -188 -250 0 -250 0 0 250 0 250 190 0 190 0 32 30 33 29 -228 1 -228 0 -24 -25z" /></g>');
        this.plugin.addRibbonIcon(RibbonIcon.ID, this.ribbonTitle, this.ribbonIconCallback);
        this.plugin.addCommand({
            id: 'open-workflow',
            name: t('command_open_workflow'),
            callback: async () => {
                this.ribbonIconCallback();
            }
        });
        log.info('RibbonIcon loaded');
    }
    private ribbonIconCallback = async () => {
        let flow: Flow | undefined;
        if (this.plugin.settings.ribbonCanvas) {
            flow = await canvas.flows.update(this.plugin.settings.ribbonCanvas);
        }
        new SelectorMenuModal(this.plugin.app, this.plugin, flow).open();
    }
}