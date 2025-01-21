import { CommunityStepSettings } from "config";
import ZettelFlow from "main";
import { Modal } from "obsidian";

export class CommunityStepModal extends Modal {
  constructor(private plugin: ZettelFlow, private step: CommunityStepSettings) {
    super(plugin.app);
  }
}
