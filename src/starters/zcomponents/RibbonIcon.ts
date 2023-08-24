import { PluginComponent } from "architecture";
import { log } from "architecture";
import { SelectorMenuModal } from "components";
import ZettlelFlow from "main";
import { addIcon } from "obsidian";

export class RibbonIcon extends PluginComponent {
    public static ID = 'zettelflow-ribbon-icon';
    private ribbonTitle = 'Create a new Zettel Note';
    private svgContent = '<g transform="translate(0,95) scale(0.025,-0.0275)" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"> <path d="M904 3256 l6 -233 -59 -22 c-77 -28 -108 -50 -252 -178 -66 -60 -144 -125 -172 -146 -29 -21 -79 -64 -111 -95 -33 -31 -78 -70 -101 -87 -24 -16 -81 -64 -128 -105 l -86 -75 -1 -1145 c0 -879 3 -1149 12 -1158 9 -9 455 -12 1945 -12 l1933 0 17 27 c17 26 18 107 21 1433 2 937 -1 1417 -7 1440 -6 20 -24 49 -41 65 l -31 30 -352 5 -352 5 -3 243 -2 242 -1122 0 -1121 0 7 -234z m2124 -428 l2 -547 -22 -3 c -13 -2 -58 -2 -100 0 l -78 4 0 364 0 364 -805 0 -805 0 0 -365 0 -365 -95 0 -95 0 0 550 0 550 998 -2 997 -3 3 -547z m572 -1004 l0 -115 -57 -52 c -32 -28 -119 -110 -193 -181 -367 -352 -331 -323 -380 -301 -45 21 -168 17 -196 -5 -13 -12 -24 -4 -77 56 -34 38 -90 96 -124 129 -35 33 -63 65 -63 71 0 7 9 31 20 55 39 86 17 196 -48 251 -18 15 -56 32 -85 38 -45 11 -62 10 -110 -4 -119 -35 -157 -112 -135 -276 10 -79 10 -91 -5 -112 -17 -23 -40 -55 -145 -204 -91 -129 -143 -189 -161 -186 -68 13 -122 13 -149 -1 -30 -15 -31 -14 -73 32 -73 79 -219 251 -229 270 -7 13 -4 35 10 74 27 75 25 123 -5 183 -35 70 -86 99 -177 99 -58 0 -72 -4 -109 -30 -61 -43 -78 -72 -85 -141 -5 -45 -2 -76 11 -116 l17 -55 -71 -109 c -38 -60 -99 -154 -134 -209 -35 -55 -90 -140 -123 -189 -32 -49 -73 -116 -90 -148 -17 -32 -40 -68 -51 -81 -12 -12 -31 -40 -43 -61 -12 -21 -38 -60 -59 -85 -21 -25 -53 -73 -71 -106 -38 -67 -45 -75 -77 -75 l -23 0 0 850 0 850 1645 0 1645 0 0 -116z m0 -926 l0 -671 -182 6 c -99 4 -804 7 -1566 7 -1364 0 -1384 0 -1371 19 44 61 155 227 158 236 5 16 53 88 76 115 12 14 34 48 50 75 15 28 53 88 84 135 30 47 94 148 142 225 48 77 96 154 106 170 13 20 25 29 39 26 10 -2 52 -3 91 -4 l73 0 52 -57 c49 -53 78 -86 198 -222 l42 -47 -12 -49 c -17 -65 -6 -131 31 -182 49 -67 81 -81 174 -78 94 4 120 18 159 88 35 65 41 109 22 174 l -16 56 28 53 c16 30 57 91 91 136 34 45 73 99 86 119 14 20 42 59 63 87 l39 49 94 -3 c52 -1 99 -6 105 -9 6 -4 38 -38 71 -77 33 -38 83 -94 111 -124 l51 -55 -6 -68 c -7 -86 13 -146 65 -186 102 -79 224 -64 296 36 29 41 31 50 31 129 l1 85 54 49 c30 27 64 58 75 70 11 11 46 46 78 77 33 31 94 92 138 135 44 42 83 77 87 77 4 0 23 16 42 35 19 19 38 35 43 35 4 0 7 -302 7 -672z"/> </g>';
    constructor(private plugin: ZettlelFlow) {
        super(plugin);
    }

    onLoad(): void {
        addIcon(RibbonIcon.ID, this.svgContent);
        this.plugin.addRibbonIcon(RibbonIcon.ID, this.ribbonTitle, this.ribbonIconCallback);
        log.info('RibbonIcon loaded');
    }
    private ribbonIconCallback = (evt: MouseEvent) => {
        // Open an empty modal
        new SelectorMenuModal(this.plugin.app, this.plugin).open();
    }
}