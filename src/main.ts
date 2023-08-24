import { DEFAULT_SETTINGS, ZettelFlowSettings, canvasFileTreeArray2rootSection } from 'config';
import { loadPluginComponents, loadServicesThatRequireSettings } from 'starters';
import { ItemView, Plugin } from 'obsidian';
import { CanvasService } from 'architecture/plugin';
import { CanvasView } from 'obsidian/canvas';

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
				const canvasTree = CanvasService.getCanvasFileTree((canvasView as CanvasView).canvas);
				this.settings.rootSection = canvasFileTreeArray2rootSection(canvasTree);
				await this.saveSettings();
			}
		}));
	}
}
