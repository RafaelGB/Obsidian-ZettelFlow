import { CustomZettelAction, ExecuteInfo } from "architecture/api";
import { BackLinkHandler } from "./BackLinkHandler";

export class BackLinkAction extends CustomZettelAction {
  id = "backlink";
  stepHandler = new BackLinkHandler();

  async execute(info: ExecuteInfo) {}

  getIcon() {
    return "links-coming-in";
  }
  getLabel() {
    return "Backlinks";
  }
  public isBackground() {
    return true;
  }
}
