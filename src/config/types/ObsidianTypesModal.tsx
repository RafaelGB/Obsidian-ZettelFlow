import { c } from "architecture";
import ZettelFlow from "main";
import { Modal, setIcon } from "obsidian";
import { ObsidianNativeTypesManager } from "architecture/plugin";

export class ObsidianTypesModal extends Modal {
  private rawTypes: Record<string, string> = {};
  private filteredTypes: Record<string, string> = {};

  // refs UI
  private tbodyEl: HTMLTableSectionElement | null = null;
  private addBtn!: HTMLButtonElement;
  private searchInput!: HTMLInputElement;
  private tableWrap!: HTMLDivElement;

  // filas vivas para validar/leer
  private rows: Array<{
    tr: HTMLTableRowElement;
    nameInput: HTMLInputElement;
    typeSelect: HTMLSelectElement;
    editBtn: HTMLButtonElement;
    deleteBtn: HTMLButtonElement;
  }> = [];

  constructor(private plugin: ZettelFlow) {
    super(plugin.app);
  }

  async onOpen(): Promise<void> {
    this.modalEl.addClass(c("modal"));

    this.rawTypes = (await ObsidianNativeTypesManager.getTypes?.()) ?? {};
    this.filteredTypes = { ...this.rawTypes };
    // limpiar
    this.contentEl.empty();

    // NAVBAR
    const navbar = this.contentEl.createDiv({ cls: c("modal-navbar") });
    navbar.createEl("h2", {
      text: "Tipos personalizados",
      cls: c("modal-title"),
    });

    // Toolbar: filtro + añadir
    const toolbar = navbar.createDiv({ cls: c("types-toolbar") });
    const searchWrap = toolbar.createDiv({ cls: c("search-wrap") });
    this.searchInput = searchWrap.createEl("input", {
      type: "search",
      placeholder: "Filtrar por nombre…",
      cls: c("search-input"),
    });
    this.searchInput.addEventListener("input", () => this.applyFilter());
    this.tableWrap = this.contentEl.createDiv({ cls: c("types-cards-wrap") });

    const table = this.tableWrap.createEl("table", { cls: c("cards") });

    const thead = table.createEl("thead");
    const headRow = thead.createEl("tr");
    headRow.createEl("th", { text: "Nombre", cls: c("col-name") });
    headRow.createEl("th", { text: "Tipo", cls: c("col-type") });
    headRow.createEl("th", { text: "Acciones", cls: c("col-actions") });

    this.tbodyEl = table.createEl("tbody");

    // New row button
    const footer = this.contentEl.createDiv({ cls: c("types-footer") });
    this.addBtn = footer.createEl(
      "button",
      { text: "Añadir fila", title: "Añadir" },
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

    await this.renderCards();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async renderCards() {
    // limpiar
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

    const tr = this.tbodyEl.createEl("tr", { cls: c("types-row") });

    // Actions cell
    const tdActions = tr.createEl("td", { cls: c("actions-cell") });

    const editBtn = tdActions.createEl("button", {
      title: "Editar",
      cls: c("edit-btn"),
    });
    setIcon(editBtn, "edit");
    editBtn.addEventListener("click", () => {
      onEdit(nameInput.value, typeSelect.value);
    });

    const deleteBtn = tdActions.createEl("button", {
      title: "Eliminar",
      cls: c("delete-btn"),
    });

    setIcon(deleteBtn, "trash");
    deleteBtn.addEventListener("click", () => {
      tr.remove();
      this.rows = this.rows.filter((r) => r.tr !== tr);
      ObsidianNativeTypesManager.removeType(nameInput.value);
    });

    // Name
    const tdName = tr.createEl("td");
    const nameInput = tdName.createEl("input", {
      type: "text",
      value: name,
      placeholder: "p.ej. prioridad",
    });
    nameInput.classList.add(c("name-input"));

    // Type
    const tdType = tr.createEl("td");
    const typeSelect = tdType.createEl("select");
    typeSelect.classList.add(c("type-select"));
    ObsidianNativeTypesManager.AVAILABLE_TYPES.forEach((opt) => {
      const o = document.createElement("option");
      o.value = opt;
      o.textContent = opt;
      if (opt === type) o.selected = true;
      typeSelect.appendChild(o);
    });
    if (!ObsidianNativeTypesManager.AVAILABLE_TYPES.includes(type)) {
      typeSelect.value = ObsidianNativeTypesManager.AVAILABLE_TYPES[0];
    }

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
