import { c } from "architecture";
import ZettelFlow from "main";
import { Modal, setIcon } from "obsidian";
import { ObsidianNativeTypesManager } from "architecture/plugin";
import { t } from "architecture/lang";
import { TypeIcon } from "./TypeIcon";

export class ObsidianTypesModal extends Modal {
  private rawTypes: Record<string, string> = {};
  private filteredTypes: Record<string, string> = {};
  private typesWithHook: string[] = [];

  // refs UI
  private tbodyEl: HTMLTableSectionElement | null = null;
  private addBtn!: HTMLButtonElement;
  private searchInput!: HTMLInputElement;
  private tableWrap!: HTMLDivElement;

  private rows: Array<{
    tr: HTMLTableRowElement;
    nameInput: HTMLInputElement;
    typeSelect: TypeIcon;
    editBtn: HTMLButtonElement;
    deleteBtn: HTMLButtonElement;
  }> = [];

  constructor(plugin: ZettelFlow) {
    super(plugin.app);
    this.typesWithHook = Object.keys(plugin.settings.hooks.properties);
  }

  async onOpen(): Promise<void> {
    this.modalEl.addClass(c("modal"));

    this.rawTypes = (await ObsidianNativeTypesManager.getTypes?.()) ?? {};
    this.filteredTypes = { ...this.rawTypes };
    this.contentEl.empty();

    const navbar = this.contentEl.createDiv({ cls: c("modal-navbar") });
    navbar.createEl("h2", {
      text: t("types_modal_title"),
      cls: c("modal-title"),
    });

    const toolbar = navbar.createDiv({ cls: c("types-toolbar") });
    const searchWrap = toolbar.createDiv({ cls: c("search-wrap") });
    this.searchInput = searchWrap.createEl("input", {
      type: "search",
      placeholder: t("types_modal_filter_placeholder"),
      cls: c("search-input"),
    });
    this.searchInput.addEventListener("input", () => this.applyFilter());

    const nativePropertiesEditBtn = toolbar.createEl("button", {
      title: t("types_modal_native_properties_edit_button_title"),
      cls: "mod-cta"
    });
    setIcon(nativePropertiesEditBtn.createDiv(), "archive");
    nativePropertiesEditBtn.addEventListener("click", () => {
      this.app.workspace.revealLeaf(this.app.workspace.getLeavesOfType('all-properties')[0]);
      closeAllModalsByEsc();
    });

    // New row button
    const footer = this.contentEl.createDiv({ cls: c("types-footer") });
    this.addBtn = footer.createEl(
      "button",
      {
        text: t("types_modal_add_row_button"),
        title: t("types_modal_add_row_button_title"),
        cls: c("add-row-btn"),
      },
      (el) => {
        setIcon(el, "plus");
        el.addClass(c("add-row-btn"));
      }
    );
    this.addBtn.addEventListener("click", () =>
      this.addRow(
        "",
        ObsidianNativeTypesManager.AVAILABLE_TYPES[0],
        (value, type) => {
          ObsidianNativeTypesManager.addType(value, type);
        }
      )
    );

    this.tableWrap = this.contentEl.createDiv({ cls: c("types-cards-wrap") });

    const table = this.tableWrap.createEl("table", { cls: c("cards") });

    const thead = table.createEl("thead");
    const headRow = thead.createEl("tr");
    headRow.createEl("th", {
      text: t("types_modal_table_header_name"),
      cls: c("col-name"),
    });
    headRow.createEl("th", {
      text: t("types_modal_table_header_type"),
      cls: c("col-type"),
    });
    headRow.createEl("th", {
      text: t("types_modal_table_header_actions"),
      cls: c("col-actions"),
    });

    this.tbodyEl = table.createEl("tbody");

    await this.renderCards();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async renderCards() {
    // Initialize tbody
    this.tbodyEl?.empty();
    this.rows = [];

    // Initialize rows
    Object.entries(this.filteredTypes).forEach(([name, type]) =>
      this.addRow(name, type, (value, type) => {
        ObsidianNativeTypesManager.updateType(value, type);
      })
    );
  }

  /**
   * Adds a new row to the table with the given name and type.
   * @param {string} name - The name of the type.
   * @param {string} type - The type of the property.
   */
  private addRow(
    name: string,
    type: string,
    onEdit: (value: string, type: string) => void
  ) {
    if (!this.tbodyEl) return;

    const trClasses = [c("types-row")];
    if (this.typesWithHook.includes(name)) {
      trClasses.push(c("types-row-with-hook"));
    }

    const tr = this.tbodyEl.createEl("tr", { cls: trClasses });

    // Name and type container
    const nameAndTypeContainer = tr.createEl("div", {
      cls: c("name-type-container"),
    });
    // Name
    const tdName = nameAndTypeContainer.createEl("td");
    const nameInput = tdName.createEl("input", {
      type: "text",
      value: name,
      placeholder: t("types_modal_name_input_placeholder"),
    });
    nameInput.classList.add(c("name-input"));

    // Type applying icon
    const tdType = nameAndTypeContainer.createEl("td");
    const typeSelect = new TypeIcon(tdType, type, () => {
      // In case of future features, this is the callback for when the type changes
    });

    // Actions cell
    const tdActions = tr.createEl("td", { cls: c("actions-cell") });

    const editBtn = tdActions.createEl("button", {
      title: t("types_modal_edit_button_title"),
      cls: c("edit-btn"),
    });
    setIcon(editBtn, "edit");
    editBtn.addEventListener("click", () => {
      onEdit(nameInput.value, typeSelect.getValue());
    });

    const deleteBtn = tdActions.createEl("button", {
      title: t("types_modal_delete_button_title"),
      cls: c("delete-btn"),
    });

    setIcon(deleteBtn, "trash");
    deleteBtn.addEventListener("click", () => {
      tr.remove();
      this.rows = this.rows.filter((r) => r.tr !== tr);
      ObsidianNativeTypesManager.removeType(nameInput.value);
    });

    this.rows.push({ tr, nameInput, typeSelect, editBtn, deleteBtn });
  }

  private applyFilter() {
    const filter = this.searchInput.value.toLowerCase();
    const searchTypes: Record<string, string> = {};
    if (!filter) {
      this.filteredTypes = { ...this.rawTypes };
    } else {
      Object.keys(this.rawTypes).forEach((valueKey) => {
        if (valueKey.toLowerCase().includes(filter)) {
          searchTypes[valueKey] = this.rawTypes[valueKey];
        }
      });
      this.filteredTypes = searchTypes;
    }

    this.renderCards();
  }
}

/**
 * Closes all modals by simulating an Escape key press.
 */
export function closeAllModalsByEsc(): void {
  const hasModals = () =>
    document.querySelector(".modal-container, .modal-bg") !== null;

  // Prevent infinite loop
  let guard = 25;

  while (hasModals() && guard-- > 0) {
    const evt = new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      keyCode: 27,
      which: 27,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(evt);
  }
}