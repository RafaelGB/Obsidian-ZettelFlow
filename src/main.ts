import { DEFAULT_SETTINGS, ZettelFlowSettings, ZettelSettingsMapper } from 'config';
import { loadPluginComponents, loadServicesThatRequireSettings } from 'starters';
import { ItemView, Notice, Plugin, TFile, TFolder } from 'obsidian';
import { CanvasMapper, FrontmatterService } from 'architecture/plugin';
import { CanvasView } from 'obsidian/canvas';
import { t } from 'architecture/lang';
import { RibbonIcon } from 'starters/zcomponents/RibbonIcon';
import { StepBuilderMapper, StepBuilderModal, ZettelFlowElement } from 'zettelkasten';
import { actionsStore } from 'architecture/api/store/ActionsStore';
import { BackLinkAction, CalendarAction, PromptAction, SelectorAction, TagsAction } from 'actions';
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
			this.saveWorkflow(file);
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
						const canvasView = this.app.workspace.getActiveViewOfType(ItemView);
						if (canvasView?.getViewType() === 'canvas' && file?.path === this.settings.canvasFilePath) {
							menu.addItem((item) => {
								item
									.setTitle("Save zettelFlow configuration")
									.setIcon(RibbonIcon.ID)
									.onClick(async () => {
										this.saveWorkflow(file);
										new Notice("ZettelFlow configuration Saved!");
									});
							});

						}
					}
				}
			}));
	}

	private async saveWorkflow(file: TFile | null) {
		const canvasView = this.app.workspace.getActiveViewOfType(ItemView);
		if (canvasView?.getViewType() === 'canvas' && file?.path === this.settings.canvasFilePath) {
			const canvasTree = CanvasMapper.instance((canvasView as CanvasView).canvas).getCanvasFileTree();
			if (canvasTree.length === 0) return;
			const { sectionMap, workflow } = ZettelSettingsMapper.instance(canvasTree).marshall();
			if (workflow.length === 0) return;
			const recordNodes: Record<string, ZettelFlowElement> = {};
			sectionMap.forEach((node, key) => {
				recordNodes[key] = node;
			});
			this.settings.nodes = recordNodes;
			this.settings.workflow = workflow;
			await this.saveSettings();
		}
	}
}
