import { CustomZettelAction, ExecuteInfo } from "architecture/api";
import { BackLinkHandler } from "./BackLinkHandler";
import { BacklinkElement } from "./model/BackLinkTypes";
import { EditService, FileService } from "architecture/plugin";
export class BackLinkAction extends CustomZettelAction {
  id = "backlink";
  stepHandler = new BackLinkHandler();

  async execute(info: ExecuteInfo) {
    const { element, note } = info;

    const { defaultFile, defaultHeading } = element as BacklinkElement;
    // Insert
    const mdLink = `\n- [[${note.getTitle()}]]\n`;

    if (defaultFile && defaultHeading) {
      const targetFile = await FileService.getFile(defaultFile);
      if (targetFile) {
        await EditService.instance(targetFile)
          .setContent(await FileService.getContent(targetFile))
          .insertBacklink(mdLink, defaultHeading)
          .save();
      }
    }
  }

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
