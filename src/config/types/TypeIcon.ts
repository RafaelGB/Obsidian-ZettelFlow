import { c } from "architecture";
import { ObsidianNativeTypesManager } from "architecture/plugin";
import { Component, Menu, setIcon } from "obsidian";

type TypeOption = {
  value: string;
  icon: string;
};

export class TypeIcon extends Component {
  private value: string;
  private options: TypeOption[];
  private triggerEl: HTMLElement;
  private iconEl: HTMLElement;
  private onChange: (value: string) => void;

  constructor(
    private parentEl: HTMLElement,
    initialValue: string,
    onChange: (value: string) => void
  ) {
    super();
    this.value = initialValue;
    this.onChange = onChange;
    this.options = ObsidianNativeTypesManager.AVAILABLE_TYPES.map((type) => ({
      value: type,
      icon: this.getIconForType(type),
    }));

    this.triggerEl = this.parentEl.createDiv({
      cls: c("type-icon-trigger"),
      attr: { "aria-label": "Change type" },
    });
    this.iconEl = this.triggerEl.createSpan();
    this.updateIcon();

    this.triggerEl.addEventListener("click", this.showMenu.bind(this));
  }

  private updateIcon() {
    const icon = this.getIconForType(this.value);
    setIcon(this.iconEl, icon);
  }

  private showMenu(event: MouseEvent) {
    const menu = new Menu();
    this.options.forEach((option) => {
      menu.addItem((item) => {
        item
          .setTitle(option.value)
          .setIcon(option.icon)
          .onClick(() => {
            this.value = option.value;
            this.updateIcon();
            this.onChange(this.value);
          });
      });
    });
    menu.showAtMouseEvent(event);
  }

  getValue() {
    return this.value;
  }

  private getIconForType(type: string): string {
    switch (type) {
      case "text":
        return "text";
      case "number":
        return "hash";
      case "date":
        return "calendar";
      case "datetime":
        return "clock";
      case "multitext":
        return "list";
      case "checkbox":
        return "check-square";
      default:
        return "file-question";
    }
  }
}
