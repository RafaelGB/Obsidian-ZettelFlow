import { DEFAULT_SETTINGS, ZettelFlowSettings } from 'config';
import { loadPluginComponents, loadServicesThatRequireSettings } from 'starters';
import { Notice, Plugin, TFile, TFolder } from 'obsidian';
import { FrontmatterService, YamlService } from 'architecture/plugin';
import { t } from 'architecture/lang';
import { RibbonIcon } from 'starters/zcomponents/RibbonIcon';
import { StepBuilderMapper, StepBuilderModal } from 'zettelkasten';
import { actionsStore } from 'architecture/api/store/ActionsStore';
import { BackLinkAction, CalendarAction, CheckboxAction, CodeView, PromptAction, ScriptAction, SelectorAction, TagsAction } from 'actions';
import { canvas } from 'architecture/plugin/canvas';
import { log } from 'architecture';

export default class ZettelFlow extends Plugin {
	public settings: ZettelFlowSettings;
	async onload() {
		await this.loadSettings();
		loadPluginComponents(this);

		this.registerViews();
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

	registerViews() {
		this.registerView(CodeView.NAME, (leaf) => new CodeView(leaf));
		try {
			this.registerExtensions(CodeView.EXTENSIONS, CodeView.NAME);
		} catch (e) {
			log.error("There was an error registering CodeView for Javascript files. Maybe another plugin is using the same extensions?", e);
			new Notice("Error registering CodeView extension for ZettelFlow. Check the console for more information.");
		}
	}

	registerActions() {
		actionsStore.registerAction(new PromptAction());
		actionsStore.registerAction(new CheckboxAction());
		actionsStore.registerAction(new SelectorAction());
		actionsStore.registerAction(new CalendarAction());
		actionsStore.registerAction(new BackLinkAction());
		actionsStore.registerAction(new TagsAction());
		actionsStore.registerAction(new ScriptAction());
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
						const fileService = FrontmatterService.instance(file);
						let mappedInfo = {};
						let title = t("menu_pane_transform_note_into_step");
						if (fileService.hasZettelFlowSettings()) {
							const zettelFlowSettings = fileService.getZettelFlowSettings();
							mappedInfo = StepBuilderMapper.StepSettings2PartialStepBuilderInfo(zettelFlowSettings);
							menu.addItem((item) => {
								// Remove step configuration
								item
									.setTitle(t("menu_pane_remove_step_configuration"))
									.setIcon(RibbonIcon.ID)
									.onClick(async () => {
										await fileService.removeStepSettings();
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
										await fileService.setZettelFlowSettings(clipboardSettings);
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
				if (file?.path !== this.settings.ribbonCanvas) {
					return;
				}
				const data = node.canvas.data;
				const currentNode = data.nodes.find((n) => n.id === node.id);
				if (!currentNode) {
					return;
				}

				if (currentNode.type === "text" || currentNode.type === "group") {
					const zettelFlowSettings = currentNode.zettelflowConfig;
					menu.addItem((item) => {
						// Edit embed
						item
							.setTitle(t("canvas_node_menu_edit_embed"))
							.setIcon(RibbonIcon.ID)
							.setSection('pane')
							.onClick(async () => {
								const stepSettings = YamlService.instance(zettelFlowSettings).getZettelFlowSettings();
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
								canvas.clipboard.save(YamlService.instance(zettelFlowSettings).getZettelFlowSettings());
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
									flow.editTextNode(node.id, JSON.stringify(clipboardSettings));
									new Notice("Embed pasted!");
								})

						});
					}
				}

			})
		);

		this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
			if (oldPath === this.settings.ribbonCanvas) {
				canvas.flows.delete(oldPath);
				this.settings.ribbonCanvas = file.path;
				this.saveSettings();
				log.info("Renamed canvas file");
			} else if (oldPath === this.settings.jsLibraryFolderPath) {
				this.settings.jsLibraryFolderPath = file.path;
				this.saveSettings();
				log.info("Renamed js library folder");
			}
		}));

		this.registerEvent(this.app.vault.on("delete", (file) => {
			if (file.path === this.settings.ribbonCanvas) {
				canvas.flows.delete(file.path);
				this.settings.ribbonCanvas = "";
				this.saveSettings();
				log.info("Deleted canvas file");
			} else if (file.path === this.settings.jsLibraryFolderPath) {
				this.settings.jsLibraryFolderPath = "";
				log.info("Deleted canvas file");
			}
		}));
	}
}
