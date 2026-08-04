import { DEFAULT_SETTINGS, ZettelFlowSettings } from 'config';
import { loadVariableTextProcessors, loadPluginComponents, loadServicesThatRequireSettings, unloadPluginComponents } from 'starters';
import { Notice, Plugin } from 'obsidian';
import { actionsStore } from 'architecture/api/store/ActionsStore';
import {
	BackLinkAction, CalendarAction, CheckboxAction,
	CssClassesAction, DynamicSelectorAction, NumberAction, PromptAction, ScriptAction, SelectorAction,
	TagsAction, TaskManagementAction
} from 'actions';
import { log } from 'architecture';
import { t } from 'architecture/lang';
import { Hooks } from 'hooks';
import { CodeView } from 'architecture/components/core';
import { HistoryView } from 'architecture/components/core/historyView/HistoryView';
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
		allCanvasExtensions.forEach((Extension) => {
			this.canvasExtensions.push(new Extension(this));
		});
	}

	onunload() {
		unloadPluginComponents();
		actionsStore.unregisterAll();
	}

	async loadMarkdownPostProcessor() {

	}

	async loadSettings() {
		const loaded = (await this.loadData()) as Partial<ZettelFlowSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded ?? {}) as ZettelFlowSettings;

		// Object.assign is shallow — patch nested objects so older saved data that
		// predates a new sub-field still gets the correct default value.
		this.settings.installedTemplates = {
			steps: loaded?.installedTemplates?.steps ?? {},
			actions: loaded?.installedTemplates?.actions ?? {},
		};

		// Remove clipboard template. This is not a setting that should be saved.
		delete this.settings.communitySettings?.clipboardTemplate;
		void this.saveSettings();
		loadServicesThatRequireSettings(this.settings);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	registerViews() {
		this.registerView(CodeView.NAME, (leaf) => new CodeView(leaf));
		this.registerView(HistoryView.NAME, (leaf) => new HistoryView(leaf, this));
		try {
			this.registerExtensions(CodeView.EXTENSIONS, CodeView.NAME);
		} catch (e) {
			log.error("There was an error registering CodeView for Javascript files. Maybe another plugin is using the same extensions?", e);
			new Notice(t('notice_codeview_registration_error'));
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
