import { DEFAULT_SETTINGS, ZettelFlowSettings } from 'config';
import { loadPluginComponents, loadServicesThatRequireSettings } from 'starters';
import { Notice, Plugin } from 'obsidian';
import { actionsStore } from 'architecture/api/store/ActionsStore';
import {
	BackLinkAction, CalendarAction, CheckboxAction, CodeView,
	CssClassesAction, NumberAction, PromptAction, ScriptAction, SelectorAction,
	TagsAction
} from 'actions';
import { log } from 'architecture';
import { Hooks } from 'hooks';

export default class ZettelFlow extends Plugin {
	public settings: ZettelFlowSettings;
	async onload() {
		await this.loadSettings();
		loadPluginComponents(this);

		this.registerViews();
		this.registerActions();
		Hooks.setup(this);

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
		actionsStore.registerAction(new NumberAction());
		actionsStore.registerAction(new CheckboxAction());
		actionsStore.registerAction(new SelectorAction());
		actionsStore.registerAction(new CalendarAction());
		actionsStore.registerAction(new BackLinkAction());
		actionsStore.registerAction(new TagsAction());
		actionsStore.registerAction(new CssClassesAction());
		actionsStore.registerAction(new ScriptAction());
	}
}
