import { CustomZettelAction, ExecuteInfo } from "architecture/api";
import { CalendarWrapper } from "./CalendarComponent";
import React from "react";
import { WrappedActionBuilderProps } from "components/noteBuilder";
import { calendarSettings } from "./CalendarSettings";
import { t } from "architecture/lang";
import { TypeService } from "architecture/typing";
import { addIcon } from "obsidian";

export class CalendarAction extends CustomZettelAction {
  id = "calendar";
  constructor() {
    super();
    addIcon(
      `zettelflow-${this.id}-icon`,
      `<g translate(-01,-01) scale(0.02,0.02)" stroke="none" > <path d="M1163 5045 c-33 -17 -61 -41 -79 -68 l-29 -42 -3 -425 c-2 -290 0 -437 8 -463 13 -44 61 -102 102 -123 16 -8 57 -17 93 -21 117 -11 203 27 248 110 22 41 22 50 25 440 3 441 0 481 -50 541 -45 55 -97 76 -189 76 -61 0 -85 -5 -126 -25z" /> <path d="M3755 5056 c-40 -18 -84 -63 -104 -106 -14 -30 -16 -92 -19 -422 -4 -489 -1 -507 92 -582 34 -28 46 -31 124 -35 98 -4 148 8 193 46 68 58 69 60 69 533 0 422 0 426 -22 470 -13 24 -40 58 -61 74 -37 29 -44 31 -140 34 -70 1 -111 -2 -132 -12z" /> <path d="M240 4646 c-90 -24 -172 -95 -214 -185 l-21 -46 0 -2060 0 -2060 27 -57 c31 -66 91 -128 156 -160 l47 -23 2325 0 2325 0 47 23 c65 32 125 94 156 160 l27 57 0 2060 0 2060 -28 56 c-32 66 -99 132 -165 162 -44 21 -64 22 -349 25 l-303 3 0 -334 c0 -275 -3 -341 -16 -379 -36 -108 -143 -180 -296 -199 -215 -28 -373 46 -452 211 l-31 65 -3 318 -3 317 -890 0 -889 0 0 -292 c0 -317 -7 -371 -53 -450 -35 -59 -97 -115 -166 -146 -74 -35 -228 -43 -316 -17 -104 30 -185 98 -233 195 l-27 55 -3 328 -3 327 -302 -1 c-205 0 -317 -4 -347 -13z m4550 -2781 l0 -1495 -2230 0 -2230 0 0 1495 0 1495 2230 0 2230 0 0 -1495z" /> <path d="M2697 2943 c-4 -3 -7 -131 -7 -283 0 -201 3 -279 12 -288 17 -17 629 -17 646 0 17 17 17 549 0 566 -9 9 -96 12 -328 12 -174 0 -320 -3 -323 -7z" /> <path d="M3657 2943 c-4 -3 -7 -131 -7 -283 0 -201 3 -279 12 -288 17 -17 629 -17 646 0 17 17 17 549 0 566 -9 9 -96 12 -328 12 -174 0 -320 -3 -323 -7z" /> <path d="M781 2106 c-8 -9 -11 -95 -9 -292 l3 -279 319 -3 c227 -2 323 1 332 9 19 16 21 548 2 567 -19 19 -631 17 -647 -2z" /> <path d="M1741 2106 c-8 -9 -11 -95 -9 -292 l3 -279 319 -3 c227 -2 323 1 332 9 19 16 21 548 2 567 -19 19 -631 17 -647 -2z" /> <path d="M2701 2106 c-8 -9 -11 -95 -9 -292 l3 -279 319 -3 c227 -2 323 1 332 9 19 16 21 548 2 567 -19 19 -631 17 -647 -2z" /> <path d="M3661 2106 c-8 -9 -11 -95 -9 -292 l3 -279 319 -3 c227 -2 323 1 332 9 19 16 21 548 2 567 -19 19 -631 17 -647 -2z" /> <path d="M788 1279 c-17 -9 -18 -34 -18 -287 0 -203 3 -281 12 -290 9 -9 94 -12 319 -12 266 0 310 2 323 16 14 13 16 53 16 284 0 266 0 269 -22 284 -19 14 -66 16 -318 16 -182 0 -302 -5 -312 -11z" /> <path d="M1748 1279 c-17 -9 -18 -34 -18 -287 0 -203 3 -281 12 -290 9 -9 94 -12 319 -12 266 0 310 2 323 16 14 13 16 53 16 284 0 266 0 269 -22 284 -19 14 -66 16 -318 16 -182 0 -302 -5 -312 -11z" /> <path d="M2708 1279 c-17 -9 -18 -34 -18 -289 0 -266 1 -280 19 -290 12 -6 132 -10 320 -10 259 0 302 2 315 16 14 13 16 53 16 284 0 266 0 269 -22 284 -19 14 -66 16 -318 16 -182 0 -302 -5 -312 -11z" /> <path d="M3668 1279 c-17 -9 -18 -34 -18 -289 0 -266 1 -280 19 -290 12 -6 132 -10 320 -10 259 0 302 2 315 16 14 13 16 53 16 284 0 266 0 269 -22 284 -19 14 -66 16 -318 16 -182 0 -302 -5 -312 -11z" /> </g>`
    );
  }
  component(props: WrappedActionBuilderProps) {
    return <CalendarWrapper {...props} />;
  }

  async execute(info: ExecuteInfo) {
    const { content, element } = info;
    const { result, key, zone } = element;
    if (TypeService.isString(key) && TypeService.isDate(result)) {
      switch (zone) {
        case "body":
          content.modify(key, result.toISOString());
          break;
        case "frontmatter":
        default:
          content.addFrontMatter({ [key]: result });
      }
    }
  }

  getIcon() {
    return `zettelflow-${this.id}-icon`;
  }

  settings = calendarSettings;

  getLabel() {
    return t("type_option_calendar");
  }
}
