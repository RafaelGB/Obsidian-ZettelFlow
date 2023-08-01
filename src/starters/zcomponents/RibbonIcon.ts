import { PluginComponent } from "architecture";
import { log } from "architecture";
import { SelectorMenuModal } from "components";
import ZettlelFlow from "main";
import {addIcon} from "obsidian";

export class RibbonIcon extends PluginComponent{
    public static ID = 'zettelflow-ribbon-icon';
    private ribbonTitle = 'Create a new Zettel Note';
    private svgContent = '<g transform="translate(0,95) scale(0.03,-0.0275)" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"> <path d="M83 3413 c-12 -2 -36 -17 -53 -33 -26 -25 -30 -35 -30 -83 0 -50 3 -58 35 -86 l36 -31 1499 0 1499 0 28 -24 c27 -23 28 -28 28 -120 0 -86 -2 -98 -23 -118 l-23 -23 -1504 -5 -1504 -5 -35 -34 c-33 -32 -36 -40 -36 -93 0 -56 1 -59 42 -88 l41 -30 1502 0 c1280 0 1504 -2 1521 -14 17 -13 19 -27 19 -120 0 -96 -2 -107 -22 -128 l-23 -22 -1472 2 c-810 1 -1490 -1 -1510 -4 -22 -3 -51 -18 -68 -34 -27 -25 -30 -34 -30 -89 0 -57 2 -61 37 -88 l36 -28 1503 -3 1502 -2 27 -32 c25 -30 27 -37 23 -119 -2 -68 -7 -91 -22 -108 l-19 -21 -1488 0 c-1027 0 -1496 -3 -1516 -11 -15 -5 -40 -22 -55 -37 -23 -21 -28 -34 -28 -75 0 -63 13 -85 63 -108 41 -18 92 -19 1528 -19 1449 0 1487 0 1510 -19 22 -18 24 -26 24 -121 0 -95 -2 -103 -24 -121 -23 -19 -61 -19 -1511 -19 -958 0 -1498 -4 -1515 -10 -50 -19 -75 -58 -75 -116 0 -49 3 -55 37 -83 l38 -31 1475 0 c811 0 1492 -3 1513 -6 56 -10 70 -44 65 -156 -3 -66 -8 -93 -21 -106 -16 -16 -88 -17 -1018 -22 l-1001 -5 -34 -37 c-27 -30 -34 -46 -34 -79 0 -51 11 -72 54 -98 33 -21 37 -21 1029 -21 892 0 997 -2 1011 -16 13 -12 16 -38 16 -120 0 -163 175 -144 -1300 -144 -1247 0 -1260 0 -1280 20 -19 19 -20 33 -20 214 l0 194 -26 32 c-47 56 -66 60 -258 60 l-175 0 -36 -31 c-31 -28 -35 -36 -35 -81 0 -43 4 -54 31 -79 30 -28 36 -29 121 -29 60 0 99 -5 118 -15 17 -9 31 -17 32 -18 0 -1 4 -90 7 -197 7 -226 12 -239 103 -284 l52 -26 1358 0 c1500 0 1396 -4 1466 63 67 64 62 -66 62 1631 0 932 -4 1554 -9 1569 -15 38 -70 96 -115 120 l-41 22 -1540 1 c-847 1 -1550 0 -1562 -3z"/> </g>'
    constructor(private plugin:ZettlelFlow){
        super(plugin);
    }
    
    onLoad(): void { 
        addIcon(RibbonIcon.ID, this.svgContent);
        this.plugin.addRibbonIcon(RibbonIcon.ID, this.ribbonTitle, this.ribbonIconCallback);
        log.info('RibbonIcon loaded');
    }
    private ribbonIconCallback = (evt: MouseEvent) => {
        // Open an empty modal
        new SelectorMenuModal(this.plugin.app).open();
    }
}