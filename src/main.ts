import { DEFAULT_SETTINGS, ZettelFlowSettings } from './domain/config/model/ZettelSettingsModel';
import { loadPluginComponents, loadServicesThatRequireSettings } from './domain/starters/utils/StartersTools';
import { Plugin} from 'obsidian';

export default class ZettlelFlow extends Plugin {
	public settings: ZettelFlowSettings;
	async onload() {
		await this.loadSettings();
		loadPluginComponents(this);
	}

	onunload() {}

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
}
