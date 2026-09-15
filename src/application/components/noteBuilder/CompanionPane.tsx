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
          if (cancelled) return;
          setPreview(assembled);
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
