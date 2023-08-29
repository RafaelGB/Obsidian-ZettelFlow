import { DEFAULT_SETTINGS, WorkflowStep, ZettelFlowSettings, ZettelSettingsMapper } from 'config';
import { loadPluginComponents, loadServicesThatRequireSettings } from 'starters';
import { ItemView, Plugin, TFile, TFolder } from 'obsidian';
import { CanvasMapper, FrontmatterService } from 'architecture/plugin';
import { CanvasView } from 'obsidian/canvas';
import { t } from 'architecture/lang';
import { RibbonIcon } from 'starters/zcomponents/RibbonIcon';
import { StepBuilderMapper, StepBuilderModal, ZettelFlowElement } from 'zettelkasten';

export default class ZettlelFlow extends Plugin {
	public settings: ZettelFlowSettings;
	async onload() {
		await this.loadSettings();
		loadPluginComponents(this);
		this.registerEvents();
	}

	onunload() { }

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

	registerEvents() {
		this.registerEvent(this.app.workspace.on('file-open', async (file) => {
			const canvasView = this.app.workspace.getActiveViewOfType(ItemView);
			if (canvasView?.getViewType() === 'canvas' && file?.path === this.settings.canvasFilePath) {
				const canvasTree = CanvasMapper.instance((canvasView as CanvasView).canvas).getCanvasFileTree();
				const { sectionMap, workflow } = ZettelSettingsMapper.instance(canvasTree).marshall();
				const recordNodes: Record<string, ZettelFlowElement> = {};
				sectionMap.forEach((node, key) => {
					recordNodes[key] = node;
				});
				this.settings.nodes = recordNodes;
				this.settings.workflow = workflow;
				await this.saveSettings();
			}
		}));


		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file, source, leaf) => {
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
					const zettleFlowSettings = FrontmatterService.instance(file).getZettelFlowSettings();
					if (zettleFlowSettings) {
						const mappedInfo = StepBuilderMapper.StepSettings2PartialStepBuilderInfo(zettleFlowSettings);
						menu.addItem((item) => {
							item
								.setTitle(t("menu_pane_edit_step"))
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
					}
				}
			}));
	}
}
