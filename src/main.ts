import { DEFAULT_SETTINGS, ZettelFlowSettings } from 'config';
import { loadVariableTextProcessors, loadPluginComponents, loadServicesThatRequireSettings, unloadPluginComponents } from 'starters';
import { Notice, Plugin } from 'obsidian';
import { actionsStore } from 'architecture/api/store/ActionsStore';
import {
	BackLinkAction, CalendarAction, CheckboxAction,
	CssClassesAction, DynamicSelectorAction, NumberAction, PromptAction, ScriptAction, SelectorAction,
	TagsAction, TaskManagementAction, ZettelIdAction,
	DetectOrphanAction, CalculateMaturityAction, FindContradictionAction, FindUnansweredQuestionAction,
	SuggestNextMoveAction, ThinkingSimulatorAction,
	FindRelatedAction, SuggestLinkAction, CreateSemanticRelationAction,
	ExtractClaimsAction, CompareClaimsAction, FindSourcesAction, AttachSourceAction,
	SummarizeAction, ClassifyAction, GenerateQuestionsAction,
	ChallengeIdeaAction, SynthesizeAction, SuggestConnectionsAction
} from 'actions';
import { log } from 'architecture';
import { t } from 'architecture/lang';
import { Hooks } from 'hooks';
import { CodeView } from 'architecture/components/core';
import { HomeSurfaceView } from 'architecture/components/core/surface/HomeSurfaceView';
import { HealthSurfaceView } from 'architecture/components/core/surface/HealthSurfaceView';
import { DiscoverySurfaceView } from 'architecture/components/core/surface/DiscoverySurfaceView';
import { GraphSurfaceView } from 'architecture/components/core/surface/GraphSurfaceView';
import { LegacyRedirectView } from 'architecture/components/core/surface/LegacyRedirectView';
import { LEGACY_VIEW_TARGETS } from 'architecture/components/core/surface/legacyTargets';
import { allCanvasExtensions, canvas, CanvasExtension, CanvasPatcher } from 'architecture/plugin/canvas';
import { WorkflowEventEngine } from 'architecture/plugin/events/WorkflowEventEngine';
import { DevelopmentJournal } from 'architecture/plugin/journal/DevelopmentJournal';
import { ConceptualTimeline } from 'architecture/plugin/timeline/ConceptualTimeline';
import { repairBrokenExampleFlow, EXAMPLE_CANVAS_PATH } from 'application/notes/onboardingService';

export default class ZettelFlow extends Plugin {
	private canvasExtensions: CanvasExtension[] = [];
	public settings: ZettelFlowSettings;
	async onload() {
		await this.loadSettings();
		DevelopmentJournal.getInstance().init(this); // #162: wire the development-event journal to settings.
		ConceptualTimeline.getInstance().init(this); // #168: wire the conceptual evolution timeline to settings.
		loadVariableTextProcessors(this);

		// Register the core views + actions FIRST. If a UI component fails while loading, the
		// surfaces must already be registered — an unregistered surface view type renders as
		// Obsidian's "plugin no longer active" placeholder, which used to break every surface when
		// a single component threw before this ran. Components (ribbon/menu/commands) load after.
		this.registerViews();
		this.registerActions();

		loadPluginComponents(this);
		Hooks.setup(this);
		WorkflowEventEngine.setup(this);

		new CanvasPatcher(this);
		allCanvasExtensions.forEach((Extension) => {
			this.canvasExtensions.push(new Extension(this));
		});

		this.app.workspace.onLayoutReady(() => {
			void repairBrokenExampleFlow(this).then(repaired => {
				if (repaired) canvas.flows.delete(EXAMPLE_CANVAS_PATH);
			});
		});
	}

	onunload() {
		DevelopmentJournal.getInstance().flush(); // #162: persist any pending journal increment.
		ConceptualTimeline.getInstance().flush(); // #168: persist any pending timeline snapshot.
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
		// The four consolidated surfaces (#272, epic #268 Phase 7).
		this.registerView("zettelflow-home", (leaf) => new HomeSurfaceView(leaf, this));
		this.registerView("zettelflow-health", (leaf) => new HealthSurfaceView(leaf));
		this.registerView("zettelflow-discovery", (leaf) => new DiscoverySurfaceView(leaf));
		this.registerView("zettelflow-graph", (leaf) => new GraphSurfaceView(leaf));
		// Back-compat: the 11 retired view types redirect a restored/pinned leaf to its surface + mode.
		for (const legacyType of Object.keys(LEGACY_VIEW_TARGETS)) {
			this.registerView(legacyType, (leaf) => new LegacyRedirectView(leaf, legacyType));
		}
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
		actionsStore.registerAction(new ZettelIdAction());
		actionsStore.registerAction(new DetectOrphanAction());
		actionsStore.registerAction(new CalculateMaturityAction());
		actionsStore.registerAction(new FindContradictionAction());
		actionsStore.registerAction(new FindUnansweredQuestionAction());
		actionsStore.registerAction(new SuggestNextMoveAction());
		actionsStore.registerAction(new ThinkingSimulatorAction());
		actionsStore.registerAction(new FindRelatedAction());
		actionsStore.registerAction(new SuggestLinkAction());
		actionsStore.registerAction(new CreateSemanticRelationAction());
		actionsStore.registerAction(new ExtractClaimsAction());
		actionsStore.registerAction(new CompareClaimsAction());
		actionsStore.registerAction(new FindSourcesAction());
		actionsStore.registerAction(new AttachSourceAction());
		actionsStore.registerAction(new SummarizeAction());
		actionsStore.registerAction(new ClassifyAction());
		actionsStore.registerAction(new GenerateQuestionsAction());
		actionsStore.registerAction(new ChallengeIdeaAction());
		actionsStore.registerAction(new SynthesizeAction());
		actionsStore.registerAction(new SuggestConnectionsAction());
	}
}
