import {
  Action,
  ActionSetting,
  CustomZettelAction,
  ExecuteInfo,
} from "architecture/api";

export class TagsAction extends CustomZettelAction {
  id = "tags";
  defaultAction = {
    type: this.id,
  };
  settings: ActionSetting;
  execute(info: ExecuteInfo): Promise<void> {
    throw new Error("Method not implemented.");
  }
  getIcon(): string {
    throw new Error("Method not implemented.");
  }
  getLabel(): string {
    throw new Error("Method not implemented.");
  }
}
