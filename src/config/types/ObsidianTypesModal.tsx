import { c } from "architecture";
import ZettelFlow from "main";
import { Modal, setIcon } from "obsidian";
import { ObsidianNativeTypesManager } from "architecture/plugin";

export class ObsidianTypesModal extends Modal {
  private types: Record<string, string> = {};

  // refs UI
  private tbodyEl: HTMLTableSectionElement | null = null;
  private addBtn!: HTMLButtonElement;

  // filas vivas para validar/leer
  private rows: Array<{
    tr: HTMLTableRowElement;
    nameInput: HTMLInputElement;
    typeSelect: HTMLSelectElement;
    deleteBtn: HTMLButtonElement;
  }> = [];

  constructor(private plugin: ZettelFlow) {
    super(plugin.app);
  }

  async onOpen(): Promise<void> {
    this.modalEl.addClass(c("modal"));
    await this.renderContent();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async renderContent() {
    // limpiar
    this.contentEl.empty();
    this.rows = [];

    // intenta leer de tu manager
    this.types = (await ObsidianNativeTypesManager.getTypes?.()) ?? {};

    // NAVBAR
    const navbar = this.contentEl.createDiv({ cls: c("modal-navbar") });
    navbar.createEl("h2", {
      text: "Tipos personalizados",
      cls: c("modal-title"),
    });

    // TABLA
    const tableWrap = this.contentEl.createDiv({ cls: c("types-table-wrap") });
    const table = tableWrap.createEl("table", { cls: c("types-table") });

    const thead = table.createEl("thead");
    const headRow = thead.createEl("tr");
    headRow.createEl("th", { text: "Nombre", cls: c("col-name") });
    headRow.createEl("th", { text: "Tipo", cls: c("col-type") });
    headRow.createEl("th", { text: "Acciones", cls: c("col-actions") });

    this.tbodyEl = table.createEl("tbody");

    // Initialize rows
    Object.entries(this.types).forEach(([name, type]) =>
      this.addRow(name, type, (value, type) => {
        ObsidianNativeTypesManager.updateType(value, type);
      })
    );

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

    // Nombre
    const tdName = tr.createEl("td");
    const nameInput = tdName.createEl("input", {
      type: "text",
      value: name,
      placeholder: "p.ej. prioridad",
    });
    nameInput.classList.add(c("name-input"));

    // Tipo
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

    // Acciones
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

    this.rows.push({ tr, nameInput, typeSelect, deleteBtn });
  }
}
