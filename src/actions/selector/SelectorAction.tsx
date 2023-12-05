import { CustomZettelAction, ExecuteInfo } from "architecture/api";
import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import React from "react";
import { elementTypeSelectorSettings } from "./SelectorSettings";
import { SelectorWrapper } from "./components/SelectorComponent";
import { t } from "architecture/lang";
import { TypeService } from "architecture/typing";
import { addIcon } from "obsidian";

export class SelectorAction extends CustomZettelAction {
  private static ICON = "zettelflow-selector-icon";
  id = "selector";
  defaultAction = {
    type: this.id,
    hasUI: true,
    id: this.id,
  };
  settings = elementTypeSelectorSettings;
  constructor() {
    super();
    addIcon(
      SelectorAction.ICON,
      `<g transform="translate(-23,-2) scale(0.07,0.05)" fill="#000000" stroke="none"> <path d="M303 1288 c4 -685 0 -649 78 -808 34 -68 59 -102 128 -171 72 -72 102 -94 181 -132 209 -102 409 -102 620 0 79 38 107 59 180 132 92 93 139 170 181 296 23 70 24 72 27 683 l3 612 -701 0 -701 0 4 -612z m280 352 c58 -64 11 -160 -78 -160 -14 0 -39 13 -57 29 -27 24 -33 36 -33 69 0 94 104 132 168 62z m485 7 c12 -13 25 -40 29 -60 5 -32 1 -41 -30 -72 -25 -25 -44 -35 -67 -35 -23 0 -42 10 -67 35 -31 31 -35 40 -30 72 14 85 106 119 165 60z m492 -2 c38 -38 35 -98 -8 -136 -18 -16 -43 -29 -57 -29 -84 0 -134 91 -84 154 41 52 103 56 149 11z m-444 -256 c222 -41 417 -230 470 -456 21 -89 14 -233 -15 -326 -59 -183 -231 -342 -426 -392 -76 -19 -214 -19 -290 0 -195 50 -367 209 -426 392 -29 93 -36 237 -15 325 74 316 381 516 702 457z"/> <path d="M466 1624 c-19 -19 -21 -64 -3 -87 6 -9 24 -19 39 -22 21 -5 33 -1 52 19 30 29 33 52 10 84 -18 26 -74 30 -98 6z"/> <path d="M962 1633 c-41 -16 -32 -94 13 -115 69 -31 125 72 61 114 -12 9 -54 9 -74 1z"/> <path d="M935 860 l-310 -310 63 -62 62 -63 310 310 310 310 -63 63 -62 62 -310 -310z"/> </g>`
    );
  }
  component(props: WrappedActionBuilderProps) {
    return <SelectorWrapper {...props} />;
  }

  async execute(info: ExecuteInfo) {
    const { content, element } = info;
    const { key, zone, result } = element;
    if (TypeService.isString(key) && TypeService.isString(result)) {
      switch (zone) {
        case "body":
          content.modify(key, result);
          break;
        case "frontmatter":
        default:
          content.addFrontMatter({ [key]: result });
      }
    }
  }

  getIcon() {
    return SelectorAction.ICON;
  }

  getLabel(): string {
    return t("type_option_selector");
  }
}
