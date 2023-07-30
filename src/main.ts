import { Plugin} from 'obsidian';
import { loadPluginComponents, log } from 'core';
// Remember to rename these classes and interfaces!


export default class ZettlelFlow extends Plugin {
	async onload() {
		// TODO - Use setting to manage log level
		log.setDebugMode(true);
		log.setLevelInfo('INFO');
		log.info('loading plugin');
		loadPluginComponents(this);
	}

	onunload() {

	}
}
