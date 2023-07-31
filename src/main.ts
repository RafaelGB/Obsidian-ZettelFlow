import { Plugin} from 'obsidian';
import { DEFAULT_SETTINGS, ZettelFlowSettings, loadPluginComponents, log } from 'core';

export default class ZettlelFlow extends Plugin {
	public settings: ZettelFlowSettings;
	async onload() {
		await this.loadSettings();
		// TODO - Use setting to manage log level
		log.setDebugMode(true);
		log.setLevelInfo('INFO');
		loadPluginComponents(this);
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}
	
	async saveSettings() {
		await this.saveData(this.settings);
	  }
}
