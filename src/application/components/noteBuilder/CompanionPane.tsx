import React, { useEffect, useRef, useState } from "react";
import { Component, Notice, getAllTags, stringifyYaml } from "obsidian";
import { c, log, ObsidianApi } from "architecture";
import { t } from "architecture/lang";
import { FileService, FrontmatterService, MarkdownService } from "architecture/plugin";
import {
  AssembleNotePreviewInput,
  ConnectionSuggestion,
  NotePreview,
  PreviewElement,
  PreviewTemplate,
  SuggestionCandidate,
  assembleNotePreview,
  extractTitleKeywords,
  rankConnectionSuggestions,
} from "application/notes";
import { NoteBuilder } from "application/notes/NoteBuilder";
import { buildNoteDiff, DiffSource, NoteDiff } from "application/notes/noteDiff";
import {
  resolveSatellite,
  satellitePreview,
  SATELLITE_ERROR_KEYS,
  type SatelliteError,
} from "application/notes/satellitePlan";
import { SelectorMenuModal } from "zettelkasten";
import { NoteBuilderType } from "./typing";
import { useNoteBuilderStore } from "./state/NoteBuilderState";
import { SuggestionRow } from "./SuggestionRow";
import { FrictionPrompt } from "./FrictionPrompt";

/** UX states the pane exposes at all times (FR-7). */
type PaneState = "empty" | "loading" | "ready" | "error";

/** Coalesce rapid step/title/link changes into a single assembly (FR-8). */
const DEBOUNCE_MS = 300;

/** Upper bound on files scanned when gathering suggestion candidates (FR-8). */
const MAX_CANDIDATE_SCAN = 2000;

type TemplateCache = Map<string, PreviewTemplate>;

/** Loads (position-ordered) step templates, caching each file read for the session (FR-8). */
async function loadTemplates(
  paths: Map<number, string>,
  cache: TemplateCache
): Promise<PreviewTemplate[]> {
  const ordered = [...paths.entries()].sort((a, b) => a[0] - b[0]);
  const templates: PreviewTemplate[] = [];
  for (const [, path] of ordered) {
    let template = cache.get(path);
    if (!template) {
      const file = await FileService.getFile(path, false);
      if (!file) continue;
      const service = FrontmatterService.instance(file);
      const body = await service.getContent();
      const frontmatter = service.getFrontmatter() as Record<string, unknown>;
      template = { body, frontmatter };
      cache.set(path, template);
    }
    templates.push(template);
  }
  return templates;
}

/** Builds the pure-assembly input from the live builder state (no file writes). */
function buildPreviewInput(
  builder: NoteBuilder,
  title: string,
  modal: SelectorMenuModal,
  templates: PreviewTemplate[]
): AssembleNotePreviewInput {
  const elements: PreviewElement[] = [...builder.note.getElements().entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, element]) => ({
      type: element.type,
      zone: element.zone as string | undefined,
      key: element.key,
      result: element.result,
      staticBehaviour: element.staticBehaviour as boolean | undefined,
      staticValue: element.staticValue,
    }));

  const sourceFile = modal.getSourceFile();
  const sourceFrontmatter: Record<string, unknown> = sourceFile
    ? (ObsidianApi.metadataCache().getFileCache(sourceFile)?.frontmatter ?? {})
    : {};

  return {
    title,
    templates,
    elements,
    sourceFrontmatter,
    canvasName: modal.getCanvasName(),
    links: builder.note.getLinks(),
  };
}

function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((tag): tag is string => typeof tag === "string");
  }
  if (typeof value === "string") return [value];
  return [];
}

/** Gathers candidate notes from the metadata cache and ranks them (bounded, pure ranking). */
function gatherSuggestions(preview: NotePreview, modal: SelectorMenuModal): ConnectionSuggestion[] {
  const noteTags = normalizeTags(preview.frontmatter.tags);
  const titleKeywords = extractTitleKeywords(preview.title);
  if (noteTags.length === 0 && titleKeywords.length === 0) return [];

  const excludePaths: string[] = [];
  const sourceFile = modal.getSourceFile();
  if (sourceFile) excludePaths.push(sourceFile.path);

  const metadataCache = ObsidianApi.metadataCache();
  const files = ObsidianApi.vault().getMarkdownFiles();
  const candidates: SuggestionCandidate[] = [];
  const scanLimit = Math.min(files.length, MAX_CANDIDATE_SCAN);
  for (let i = 0; i < scanLimit; i++) {
    const file = files[i];
    const cache = metadataCache.getFileCache(file);
    const tags = cache
      ? (getAllTags(cache) ?? []).map((tag) => (tag.startsWith("#") ? tag.slice(1) : tag))
      : [];
    candidates.push({ path: file.path, basename: file.basename, tags });
  }

  return rankConnectionSuggestions({ tags: noteTags, titleKeywords, candidates, excludePaths });
}

/** The note the build starts from: the edited note in editor mode, nothing in creation mode. */
async function readBaseline(
  modal: SelectorMenuModal
): Promise<{ frontmatter: Record<string, unknown>; body: string }> {
  const file = modal.isEditor() ? modal.getSourceFile() : undefined;
  if (!file) return { frontmatter: {}, body: "" };
  const service = FrontmatterService.instance(file);
  return {
    frontmatter: service.getFrontmatter() ?? {},
    body: await service.getContent(),
  };
}

/** Each step template, labelled by its file name, so a conflict can name who set what. */
function diffSources(paths: Map<number, string>, templates: PreviewTemplate[]): DiffSource[] {
  const ordered = [...paths.entries()].sort((a, b) => a[0] - b[0]);
  return templates.map((template, index) => ({
    label: (ordered[index]?.[1] ?? "").split("/").pop()?.replace(/\.md$/, "") ?? `step ${index + 1}`,
    frontmatter: template.frontmatter,
  }));
}

/** `{{key}}` substitutions the build will perform, from the recorded body-zone results. */
function collectModifications(builder: NoteBuilder): Record<string, string> {
  const modifications: Record<string, string> = {};
  for (const element of builder.note.getElements().values()) {
    const zone = element.zone as string | undefined;
    if ((zone ?? "frontmatter") !== "body") continue;
    const result = element.result;
    // Only scalars can appear inside a {{placeholder}}; anything else is not a text substitution.
    if (typeof element.key !== "string") continue;
    if (typeof result === "string" || typeof result === "number" || typeof result === "boolean") {
      modifications[element.key] = String(result);
    }
  }
  return modifications;
}

/**
 * The linked note's preview (#419): resolved with the **same** function the build writes with, then
 * diffed with the same `buildNoteDiff` — one engine, two notes. `null` when no step declared one.
 */
async function assembleSatellite(
  builder: NoteBuilder,
  assembled: NotePreview,
  modal: SelectorMenuModal
): Promise<
  { title: string; path: string; relation: string; diff: NoteDiff } | { error: SatelliteError } | null
> {
  const declaration = builder.note.getSatellite();
  if (!declaration) return null;

  const resolved = resolveSatellite(declaration, {
    mainTitle: assembled.title,
    mainPath: `${builder.note.getTargetFolder()}/${assembled.title}.md`,
    frontmatter: assembled.frontmatter,
    canvasName: modal.getCanvasName(),
  });
  if (!resolved) return null;
  if ("error" in resolved) return resolved;

  const file = await FileService.getFile(resolved.template, false);
  if (!file) return { error: "template-missing" };
  const service = FrontmatterService.instance(file);
  const template = {
    frontmatter: (service.getFrontmatter() ?? {}) as Record<string, unknown>,
    body: await service.getContent(),
  };

  return {
    title: resolved.title,
    path: resolved.path,
    relation: resolved.edge.key,
    diff: buildNoteDiff({
      baseline: { frontmatter: {}, body: "" },
      preview: satellitePreview(resolved, template),
    }),
  };
}

/** What the build will add or change — the question the preview did not answer (#412). */
function DiffSummary({ diff, editing }: { diff: NoteDiff; editing: boolean }) {
  const changed = diff.frontmatter.filter((entry) => entry.kind !== "unchanged");
  const nothing =
    changed.length === 0 &&
    diff.bodyBlocks.length === 0 &&
    diff.conflicts.length === 0 &&
    diff.placeholders.length === 0;
  if (nothing) return null;

  return (
    <div className={c("companion-pane-diff")}>
      <h5 className={c("companion-pane-diff-heading")}>{t("companion_pane_diff_title")}</h5>
      {changed.map((entry) => (
        <div className={c("companion-pane-diff-row")} key={`fm-${entry.key}`}>
          <span className={c("companion-pane-diff-kind")}>
            {entry.kind === "added" ? t("companion_pane_diff_added") : t("companion_pane_diff_changed")}
          </span>
          <span className={c("companion-pane-diff-key")}>{entry.key}</span>
          <span className={c("companion-pane-diff-value")}>
            {entry.kind === "changed"
              ? t("companion_pane_diff_from_to", String(entry.previous), String(entry.value))
              : String(entry.value)}
          </span>
        </div>
      ))}
      {diff.bodyBlocks.length > 0 && (
        <div className={c("companion-pane-diff-row")}>
          <span className={c("companion-pane-diff-kind")}>{t("companion_pane_diff_added")}</span>
          <span className={c("companion-pane-diff-value")}>
            {t("companion_pane_diff_body_blocks", String(diff.bodyBlocks.length))}
          </span>
        </div>
      )}
      {editing &&
        diff.placeholders.map((placeholder) => (
          <div className={c("companion-pane-diff-row")} key={`ph-${placeholder.key}`}>
            <span className={c("companion-pane-diff-kind")}>
              {t("companion_pane_diff_replaced")}
            </span>
            <span className={c("companion-pane-diff-value")}>
              {t(
                "companion_pane_diff_placeholder",
                placeholder.key,
                String(placeholder.occurrences),
                placeholder.value
              )}
            </span>
          </div>
        ))}
      {diff.conflicts.map((conflict) => (
        <div
          className={c("companion-pane-diff-row", "companion-pane-diff-conflict")}
          key={`cf-${conflict.key}`}
        >
          <span className={c("companion-pane-diff-kind")}>{t("companion_pane_diff_conflict")}</span>
          <span className={c("companion-pane-diff-value")}>
            {t(
              "companion_pane_diff_conflict_detail",
              conflict.key,
              conflict.winnerSource,
              String(conflict.winner),
              conflict.overridden.map((entry) => entry.source).join(", ")
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Companion pane rendered beside the note-builder wizard on desktop (#127). Shows a live,
 * in-memory preview of the note being assembled plus bounded connection suggestions.
 *
 * Subscribes to identity-changing store values (`position`, `title`, `linkVersion`) rather than
 * `builder` — the builder object is mutated in place and never changes identity, so subscribing
 * to it would not re-render. Builder data is read fresh inside the effect.
 */
export function CompanionPane(props: NoteBuilderType & { collapsible?: boolean }) {
  const { modal, collapsible = false } = props;
  const position = useNoteBuilderStore((store) => store.position);
  const title = useNoteBuilderStore((store) => store.title);
  const linkVersion = useNoteBuilderStore((store) => store.linkVersion);

  const [state, setState] = useState<PaneState>("empty");
  const [preview, setPreview] = useState<NotePreview | null>(null);
  const [diff, setDiff] = useState<NoteDiff | null>(null);
  // The linked note's own diff (#419 FR-5), or the defect in its declaration.
  const [satellite, setSatellite] = useState<
    { title: string; path: string; relation: string; diff: NoteDiff } | { error: SatelliteError } | null
  >(null);
  const [suggestions, setSuggestions] = useState<ConnectionSuggestion[]>([]);
  // Rejected suggestions are not proposed again for the rest of the session (#411 FR-4).
  const [rejected, setRejected] = useState<string[]>([]);
  // Deliberate friction, default off (#411 FR-6): creation is high-frequency, and the manifesto
  // says friction belongs where judgement is at stake, not on every click.
  const frictionOn = props.plugin.settings.builderFriction ?? false;
  const [reading, setReading] = useState(!frictionOn);

  const previewRef = useRef<HTMLDivElement>(null);
  const componentRef = useRef<Component>(new Component());
  const templateCacheRef = useRef<TemplateCache>(new Map());

  // One markdown-render Component for the pane's lifetime; unloaded on close.
  useEffect(() => {
    const component = componentRef.current;
    component.load();
    return () => {
      component.unload();
    };
  }, []);

  // Assemble the preview (debounced) whenever the wizard state changes.
  useEffect(() => {
    const builder = useNoteBuilderStore.getState().builder;
    const paths = builder.note.getPaths();
    const elements = builder.note.getElements();
    const hasContent = paths.size > 0 || elements.size > 0 || title.length > 0;

    if (!hasContent) {
      setState("empty");
      setPreview(null);
      setSuggestions([]);
      return;
    }

    setState("loading");
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const started = window.performance.now();
        try {
          const templates = await loadTemplates(paths, templateCacheRef.current);
          if (cancelled) return;
          const assembled = assembleNotePreview(buildPreviewInput(builder, title, modal, templates));
          const nextSuggestions = gatherSuggestions(assembled, modal);
          // In edit mode the baseline is the note being edited; in creation it is an empty note.
          const baseline = await readBaseline(modal);
          if (cancelled) return;
          setPreview(assembled);
          setDiff(
            buildNoteDiff({
              baseline,
              preview: assembled,
              sources: diffSources(paths, templates),
              documentText: baseline.body,
              modifications: collectModifications(builder),
            })
          );
          setSatellite(await assembleSatellite(builder, assembled, modal));
          setSuggestions(nextSuggestions);
          setState("ready");
          log.debug(
            `Companion pane: preview assembled in ${Math.round(window.performance.now() - started)}ms`
          );
        } catch (error) {
          if (cancelled) return;
          log.error(`Companion pane: preview assembly failed: ${error}`);
          new Notice(t("companion_pane_read_error"));
          setState("error");
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [position, title, linkVersion, modal]);

  // Render the assembled note (YAML frontmatter + body) once ready.
  useEffect(() => {
    if (state !== "ready" || !preview || !previewRef.current) return;
    const frontmatterBlock =
      Object.keys(preview.frontmatter).length > 0
        ? "```yaml\n".concat(stringifyYaml(preview.frontmatter), "```\n\n")
        : "";
    MarkdownService.render(
      ObsidianApi.globalApp(),
      frontmatterBlock.concat(preview.body),
      previewRef.current,
      "/",
      componentRef.current
    );
  }, [state, preview]);

  const visible = suggestions.filter((suggestion) => !rejected.includes(suggestion.path));

  const body = (
    <>
      <section className={c("companion-pane-section")}>
        <h4 className={c("companion-pane-heading")}>{t("companion_pane_preview_title")}</h4>
        {state === "empty" && (
          <p className={c("companion-pane-status")}>{t("companion_pane_empty")}</p>
        )}
        {state === "loading" && (
          <p className={c("companion-pane-status")}>{t("companion_pane_loading")}</p>
        )}
        {state === "error" && (
          <p className={c("companion-pane-status", "companion-pane-status--error")}>
            {t("companion_pane_error")}
          </p>
        )}
        {state === "ready" && diff && <DiffSummary diff={diff} editing={modal.isEditor()} />}
        {state === "ready" && satellite && (
          <div className={c("companion-pane-satellite")}>
            <h5 className={c("companion-pane-diff-heading")}>{t("satellite_diff_title")}</h5>
            {"error" in satellite ? (
              <p className={c("companion-pane-status", "companion-pane-status--error")}>
                {t(SATELLITE_ERROR_KEYS[satellite.error])}
              </p>
            ) : (
              <>
                <p className={c("companion-pane-satellite-path")}>
                  {t("satellite_relation_summary", satellite.path, satellite.relation)}
                </p>
                <DiffSummary diff={satellite.diff} editing={false} />
              </>
            )}
          </div>
        )}
        {state === "ready" && preview && (
          <div className={c("companion-pane-preview")}>
            <h3 className={c("companion-pane-preview-title")}>
              {preview.title || t("companion_pane_untitled")}
            </h3>
            <div ref={previewRef} className={c("companion-pane-preview-body")} />
          </div>
        )}
      </section>
      <section className={c("companion-pane-section", "companion-pane-section-proposal")}>
        <h4 className={c("companion-pane-heading")}>{t("companion_pane_suggestions_title")}</h4>
        <p className={c("companion-pane-proposal-note")}>
          {t("companion_pane_suggestions_basis")}
        </p>
        {!reading ? (
          <FrictionPrompt onDone={() => setReading(true)} />
        ) : visible.length === 0 ? (
          <p className={c("companion-pane-status")}>{t("companion_pane_suggestions_empty")}</p>
        ) : (
          <ul className={c("companion-pane-suggestions")}>
            {visible.map((suggestion) => (
              <SuggestionRow
                key={suggestion.path}
                suggestion={suggestion}
                onRejected={(path) => setRejected((current) => [...current, path])}
              />
            ))}
          </ul>
        )}
      </section>
    </>
  );

  // On a phone the pane used to be removed from the tree entirely; it now collapses (#409).
  if (collapsible) {
    return (
      <details className={c("companion-pane", "companion-pane-collapsible")}>
        <summary className={c("companion-pane-summary")}>
          {t("companion_pane_preview_title")}
        </summary>
        {body}
      </details>
    );
  }

  return <div className={c("companion-pane")}>{body}</div>;
}
