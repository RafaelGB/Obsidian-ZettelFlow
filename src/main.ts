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
		this.registerEvent(this.app.workspace.on('file-open', async (file) => {
			if (file && file.path === this.settings.canvasFilePath) {
				await canvas.flows.add(file.path);
			}
		}));


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
							title = t("menu_pane_edit_step");
							// Remove step configuration
							menu.addItem((item) => {
								item
									.setTitle(t("menu_pane_remove_step_configuration"))
									.setIcon(RibbonIcon.ID)
									.onClick(async () => {
										await FrontmatterService.instance(file).removeStepSettings();
										new Notice("Step configuration removed!");
									});
							});
						}
						// Transform note into step
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
					} else if (file.extension === "canvas" && file.path === this.settings.canvasFilePath) {
						menu.addItem((item) => {
							item
								.setTitle("Save zettelFlow configuration")
								.setIcon(RibbonIcon.ID)
								.onClick(async () => {
									await canvas.flows.add(file.path);
									new Notice("ZettelFlow configuration Saved!");
								});
						});
					}
				}
			}));

		this.registerEvent(
			this.app.workspace.on("canvas:node-menu", (menu, node) => {
				// Check if canvas is the zettelFlow canvas and if the node is embedded
				const file = this.app.workspace.getActiveFile();
				if (file?.path === this.settings.canvasFilePath && typeof node.text === "string") {
					menu.addItem((item) => {
						item
							.setTitle(t("canvas_node_menu_edit_embed"))
							.setIcon(RibbonIcon.ID)
							.setSection('pane')
							.onClick(() => {
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
					});
				}

			})
		);

	}
}
