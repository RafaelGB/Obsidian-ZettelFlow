import { DEFAULT_SETTINGS, ZettelFlowSettings } from 'config';
import { loadPluginComponents, loadServicesThatRequireSettings } from 'starters';
import { Notice, Plugin, TFile, TFolder } from 'obsidian';
import { FrontmatterService, YamlService } from 'architecture/plugin';
import { t } from 'architecture/lang';
import { RibbonIcon } from 'starters/zcomponents/RibbonIcon';
import { StepBuilderMapper, StepBuilderModal } from 'zettelkasten';
import { actionsStore } from 'architecture/api/store/ActionsStore';
import { BackLinkAction, CalendarAction, PromptAction, SelectorAction, TagsAction } from 'actions';
import { canvas } from 'architecture/plugin/canvas';
export default class ZettelFlow extends Plugin {
	public settings: ZettelFlowSettings;
	async onload() {
		await this.loadSettings();
		loadPluginComponents(this);
		this.registerActions();
		this.registerEvents();

	}

	onunload() {
		actionsStore.unregisterAll();
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
		// LEGACY START: canvasFilePath was renamed to ribbonCanvas
		if (this.settings.canvasFilePath) {
			this.settings.ribbonCanvas = this.settings.canvasFilePath || "";
			delete this.settings.canvasFilePath;
		}
		// LEGACY END
		loadServicesThatRequireSettings(this.settings);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	registerActions() {
		actionsStore.registerAction(new PromptAction());
		actionsStore.registerAction(new SelectorAction());
		actionsStore.registerAction(new CalendarAction());
		actionsStore.registerAction(new BackLinkAction());
		actionsStore.registerAction(new TagsAction());
	}

	registerEvents() {
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (file instanceof TFolder) {
					menu.addItem((item) => {
						item
							.setTitle(t("menu_pane_create_new_step"))
							.setIcon(RibbonIcon.ID)
							.onClick(() => {
								new StepBuilderModal(this.app, {
									folder: file,
									menu
								})
									.setMode("create")
									.open();
							});
					}
					);
				} else if (file instanceof TFile) {
					if (file.extension === "md") {
						const zettelFlowSettings = FrontmatterService.instance(file).getZettelFlowSettings();
						let mappedInfo = {};
						let title = t("menu_pane_transform_note_into_step");
						if (zettelFlowSettings) {
							mappedInfo = StepBuilderMapper.StepSettings2PartialStepBuilderInfo(zettelFlowSettings);
							menu.addItem((item) => {
								// Remove step configuration
								item
									.setTitle(t("menu_pane_remove_step_configuration"))
									.setIcon(RibbonIcon.ID)
									.onClick(async () => {
										await FrontmatterService.instance(file).removeStepSettings();
										new Notice("Step configuration removed!");
									});
							}).addItem((item) => {
								// Copy step configuration to canvas clipboard
								item
									.setTitle(t("menu_pane_copy_step_configuration"))
									.setIcon(RibbonIcon.ID)
									.onClick(async () => {
										canvas.clipboard.save(zettelFlowSettings);
										new Notice("Step configuration copied!");
									});
							});
							// Change title to edit step if step configuration is present
							title = t("menu_pane_edit_step");
						}
						menu.addItem((item) => {
							item
								.setTitle(title)
								.setIcon(RibbonIcon.ID)
								.onClick(() => {
									new StepBuilderModal(this.app, {
										folder: file.parent || undefined,
										filename: file.basename,
										menu,
										...mappedInfo
									})
										.setMode("edit")
										.open();
								});
						});
						const clipboardSettings = canvas.clipboard.get();
						if (clipboardSettings) {
							menu.addItem((item) => {
								// Paste step configuration from canvas clipboard
								item
									.setTitle(t("menu_pane_paste_step_configuration"))
									.setIcon(RibbonIcon.ID)
									.onClick(async () => {
										await FrontmatterService.instance(file).setZettelFlowSettings(clipboardSettings);
										new Notice("Step configuration pasted!");
									});
								// Clear canvas clipboard cache
								canvas.flows.delete(this.settings.ribbonCanvas);
							});
						}
					} else if (file.extension === "canvas") {
						// Invalidate stored canvas (if was loaded before)
						canvas.flows.delete(file.path);
					}
				}
			}));

		this.registerEvent(
			this.app.workspace.on("canvas:node-menu", (menu, node) => {
				// Check if canvas is the zettelFlow canvas and if the node is embedded
				const file = this.app.workspace.getActiveFile();
				if (file?.path === this.settings.ribbonCanvas && typeof node.text === "string") {
					menu.addItem((item) => {
						// Edit embed
						item
							.setTitle(t("canvas_node_menu_edit_embed"))
							.setIcon(RibbonIcon.ID)
							.setSection('pane')
							.onClick(async () => {
								const stepSettings = YamlService.instance(node.text).getZettelFlowSettings();
								new StepBuilderModal(this.app, {
									folder: file.parent || undefined,
									filename: file.basename,
									type: "text",
									menu,
									...stepSettings
								})
									.setMode("embed")
									.setNodeId(node.id)
									.open();
							})
					}).addItem((item) => {
						// Copy embed to canvas clipboard
						item
							.setTitle(t("menu_pane_copy_step_configuration"))
							.setIcon(RibbonIcon.ID)
							.setSection('pane')
							.onClick(async () => {
								canvas.clipboard.save(YamlService.instance(node.text).getZettelFlowSettings());
								new Notice("Embed copied!");
							})
					});

					const clipboardSettings = canvas.clipboard.get();
					if (clipboardSettings) {
						menu.addItem((item) => {
							// Paste embed from canvas clipboard
							item
								.setTitle(t("menu_pane_paste_step_configuration"))
								.setIcon(RibbonIcon.ID)
								.setSection('pane')
								.onClick(async () => {
									const flow = await canvas.flows.update(file.path);
									flow.editTextNode(node.id, JSON.stringify(clipboardSettings, null, 2));
									new Notice("Embed pasted!");
								})

						});
					}
				}
			})
		);

	}
}
