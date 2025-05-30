import { DEFAULT_SETTINGS, ZettelFlowSettings } from 'config';
import { loadVariableTextProcessors, loadPluginComponents, loadServicesThatRequireSettings } from 'starters';
import { Notice, Plugin } from 'obsidian';
import { actionsStore } from 'architecture/api/store/ActionsStore';
import {
	BackLinkAction, CalendarAction, CheckboxAction,
	CssClassesAction, DynamicSelectorAction, NumberAction, PromptAction, ScriptAction, SelectorAction,
	TagsAction, TaskManagementAction
} from 'actions';
import { log } from 'architecture';
import { Hooks } from 'hooks';
import { CodeView } from 'architecture/components/core';
import { allCanvasExtensions, CanvasExtension, CanvasPatcher } from 'architecture/plugin/canvas';

export default class ZettelFlow extends Plugin {
	private canvasExtensions: CanvasExtension[] = [];
	public settings: ZettelFlowSettings;
	async onload() {
		await this.loadSettings();
		loadVariableTextProcessors(this);

		loadPluginComponents(this);

		this.registerViews();
		this.registerActions();
		Hooks.setup(this);

		new CanvasPatcher(this);
		allCanvasExtensions.forEach((Extension: any) => {
			this.canvasExtensions.push(new Extension(this));
		});
	}

	onunload() {
		actionsStore.unregisterAll();
	}

	async loadMarkdownPostProcessor() {

	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
		// Remove clipboard template. This is not a setting that should be saved.
		delete this.settings.communitySettings.clipboardTemplate;
		this.saveSettings();
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
		actionsStore.registerAction(new NumberAction());
		actionsStore.registerAction(new CheckboxAction());
		actionsStore.registerAction(new SelectorAction());
		actionsStore.registerAction(new DynamicSelectorAction());
		actionsStore.registerAction(new CalendarAction());
		actionsStore.registerAction(new BackLinkAction());
		actionsStore.registerAction(new TagsAction());
		actionsStore.registerAction(new CssClassesAction());
		actionsStore.registerAction(new ScriptAction());
		actionsStore.registerAction(new TaskManagementAction());
	}
}
