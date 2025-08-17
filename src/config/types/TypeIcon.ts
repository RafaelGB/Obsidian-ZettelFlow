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
    onChange: (value: string) => void,
    disabled: boolean = false
  ) {
    super();
    this.value = initialValue;
    this.onChange = onChange;
    this.options = ObsidianNativeTypesManager.AVAILABLE_TYPES.map((type) => ({
      value: type,
      icon: ObsidianNativeTypesManager.getIconForType(type),
    }));

    this.triggerEl = this.parentEl.createDiv({
      cls: c("type-icon-trigger"),
      attr: { "aria-label": "Change type" },
    });
    this.iconEl = this.triggerEl.createSpan();
    this.updateIcon();
    if (!disabled) {
      this.triggerEl.addEventListener("click", this.showMenu.bind(this));
    }
  }

  private updateIcon() {
    const icon = ObsidianNativeTypesManager.getIconForType(this.value);
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
}
