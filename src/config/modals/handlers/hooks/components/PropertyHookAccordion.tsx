import React, { useState, useEffect } from "react";
import { c } from "architecture";
import { t } from "architecture/lang";
import { Icon } from "architecture/components/icon";
import { CodeEditor } from "./CodeEditor";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ObsidianNativeTypesManager } from "architecture/plugin";
import { PropertyHookSettings } from "config/typing";
import { CONDITION_EXAMPLES, sanityCheckCondition } from "architecture/plugin/events/conditionHelp";
import { HookDryRunResult } from "hooks/VaultHooks";

interface PropertyHookAccordionProps {
  property: string;
  propertyType: string;
  settings: PropertyHookSettings;
  defaultOpen?: boolean;
  onChange: (patch: Partial<PropertyHookSettings>) => void;
  onDelete: () => void;
  onTest: (settings: PropertyHookSettings) => Promise<HookDryRunResult>;
}

/** A condition that references property-change fields — the examples that make sense inside a hook. */
const HOOK_CONDITION_EXAMPLES = CONDITION_EXAMPLES.filter((e) => e.condition !== "");

export const PropertyHookAccordion: React.FC<PropertyHookAccordionProps> = ({
  property,
  propertyType,
  settings,
  defaultOpen,
  onChange,
  onDelete,
  onTest,
}) => {
  const [isOpen, setIsOpen] = useState(!!defaultOpen);
  const [localScript, setLocalScript] = useState(settings.script ?? "");
  const [localDescription, setLocalDescription] = useState(settings.description ?? "");
  const [localCondition, setLocalCondition] = useState(settings.condition ?? "");
  const [testResult, setTestResult] = useState<HookDryRunResult | null>(null);

  const enabled = settings.enabled !== false;
  const conditionCheck = sanityCheckCondition(localCondition);

  useEffect(() => {
    setLocalScript(settings.script ?? "");
    setLocalDescription(settings.description ?? "");
    setLocalCondition(settings.condition ?? "");
  }, [settings.script, settings.description, settings.condition]);

  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: property });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const handleSave = () => {
    onChange({ script: localScript, description: localDescription.trim(), condition: localCondition.trim() });
    setIsOpen(false);
  };

  const handleTest = async () => {
    const result = await onTest({
      script: localScript,
      condition: localCondition.trim(),
      description: localDescription.trim(),
      enabled,
    });
    setTestResult(result);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${c("property-hooks-item")} ${enabled ? "" : c("property-hooks-item--disabled")}`}
    >
      <div className={c("property-hooks-item-header")}>
        <div
          className={c("property-hooks-drag-handle")}
          aria-label={t("property_hooks_drag_label")}
          {...attributes}
          {...listeners}
        >
          <Icon name="lucide-grip-vertical" />
        </div>

        <div className={c("property-hooks-item-info")}>
          <strong className={c("property-hooks-item-title")}>{localDescription || property}</strong>
          {localDescription && <span className={c("property-hooks-item-subtitle")}>{property}</span>}
          <span className={c("property-type-badge")}>
            <Icon name={ObsidianNativeTypesManager.getIconForType(propertyType)} />
          </span>
          {!enabled && <span className={c("property-hooks-paused-badge")}>{t("property_hooks_paused_badge")}</span>}
        </div>

        <div className={c("property-hooks-item-actions")}>
          <label className={c("property-hooks-toggle")} title={t("property_hooks_enabled_label")}>
            <input
              type="checkbox"
              checked={enabled}
              aria-label={t("property_hooks_enabled_label")}
              onChange={(e) => onChange({ enabled: e.target.checked })}
            />
          </label>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className={c("property-hooks-btn", "property-hooks-icon-btn")}
            aria-label={t(isOpen ? "property_hooks_collapse" : "property_hooks_expand")}
            title={t(isOpen ? "property_hooks_collapse" : "property_hooks_expand")}
          >
            <Icon name={isOpen ? "up-chevron-glyph" : "down-chevron-glyph"} />
          </button>
          <button
            onClick={onDelete}
            className={c("property-hooks-btn", "property-hooks-icon-btn", "property-hooks-delete-button")}
            aria-label={t("property_hooks_delete_button")}
            title={t("property_hooks_delete_button")}
          >
            <Icon name="cross" />
          </button>
        </div>
      </div>

      {isOpen && (
        <div className={c("property-hooks-item-editor")}>
          <div className={c("property-hook-field")}>
            <label className={c("property-hook-label")}>{t("property_hooks_description_label")}</label>
            <input
              type="text"
              className={c("property-hook-text-input")}
              value={localDescription}
              placeholder={t("property_hooks_description_placeholder")}
              onChange={(e) => setLocalDescription(e.target.value)}
            />
          </div>

          <div className={c("property-hook-field")}>
            <label className={c("property-hook-label")}>{t("property_hooks_condition_label")}</label>
            <p className={c("property-hook-script-hint")}>{t("property_hooks_condition_hint")}</p>
            <input
              type="text"
              className={c("property-hook-text-input")}
              value={localCondition}
              placeholder={t("property_hooks_condition_placeholder")}
              onChange={(e) => setLocalCondition(e.target.value)}
            />
            {localCondition.trim() !== "" && !conditionCheck.ok && (
              <p className={c("property-hook-warning")}>{conditionCheck.error}</p>
            )}
            <div className={c("property-hook-examples")}>
              {HOOK_CONDITION_EXAMPLES.map((example) => (
                <button
                  key={example.condition}
                  className={c("property-hooks-btn", "property-hook-example-btn")}
                  title={example.label}
                  onClick={() => setLocalCondition(example.condition)}
                >
                  {example.label}
                </button>
              ))}
            </div>
          </div>

          <div className={c("property-hook-field")}>
            <div className={c("property-hook-label-container")}>
              <label className={c("property-hook-label")}>{t("property_hooks_script_label")}</label>
              <a
                href="https://rafaelgb.github.io/Obsidian-ZettelFlow/vault-hooks/property-hooks/overview/"
                title={t("property_hooks_documentation")}
                aria-label={t("property_hooks_documentation")}
                className={c("property-hook-doc-link")}
              >
                <Icon name="book-open-text" />
              </a>
            </div>
            <p className={c("property-hook-script-hint")}>{t("property_hooks_script_hint")}</p>
            <CodeEditor value={localScript} onChange={(value) => setLocalScript(value)} />
          </div>

          {testResult && <HookTestResult result={testResult} />}

          <div className={c("property-hook-editor-buttons")}>
            <button
              onClick={() => { void handleTest(); }}
              className={c("property-hooks-btn")}
              disabled={!localScript}
            >
              <Icon name="play" />
              <span>{t("property_hooks_test_button")}</span>
            </button>
            <span className={c("property-hook-editor-spacer")} />
            <button onClick={() => setIsOpen(false)} className={c("property-hooks-btn")}>
              {t("property_hooks_cancel_button")}
            </button>
            <button
              onClick={handleSave}
              className={c("property-hooks-btn", "property-hooks-btn--cta")}
              disabled={!localScript}
            >
              {t("property_hooks_save_button")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/** Renders the outcome of a dry-run (#327 S5): what the hook would set / remove / trigger. */
const HookTestResult: React.FC<{ result: HookDryRunResult }> = ({ result }) => {
  if (result.status === "no-file") {
    return <div className={c("property-hook-test-result")}>{t("property_hooks_test_no_file")}</div>;
  }
  if (result.status === "skipped") {
    return <div className={c("property-hook-test-result")}>{t("property_hooks_test_skipped")}</div>;
  }
  if (result.status === "error") {
    return (
      <div className={`${c("property-hook-test-result")} ${c("property-hook-test-result--error")}`}>
        {t("property_hooks_test_error", result.message)}
      </div>
    );
  }
  const { frontmatter, removeProperties, flowToTrigger } = result.response;
  const sets = Object.entries(frontmatter);
  const nothing = sets.length === 0 && removeProperties.length === 0 && !flowToTrigger;
  return (
    <div className={c("property-hook-test-result")}>
      {nothing && <div>{t("property_hooks_test_no_changes")}</div>}
      {sets.length > 0 && (
        <div>
          <strong>{t("property_hooks_test_result_set")}</strong>
          <ul>
            {sets.map(([key, value]) => (
              <li key={key}>
                <code>{key}</code>: <code>{JSON.stringify(value)}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
      {removeProperties.length > 0 && (
        <div>
          <strong>{t("property_hooks_test_result_remove")}</strong> <code>{removeProperties.join(", ")}</code>
        </div>
      )}
      {flowToTrigger && <div>{t("property_hooks_test_result_flow", flowToTrigger)}</div>}
    </div>
  );
};
