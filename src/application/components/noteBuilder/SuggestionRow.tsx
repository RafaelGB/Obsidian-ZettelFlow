import React, { useState } from "react";
import { c } from "architecture";
import { t } from "architecture/lang";
import { Icon } from "architecture/components/icon";
import { FileService } from "architecture/plugin";
import { ConnectionSuggestion } from "application/notes";
import type { SuggestionVerdict } from "application/notes/suggestionVerdicts";
import type { JudgementConfidence } from "architecture/knowledge/judgement/Judgement";
import { useNoteBuilderStore } from "./state/NoteBuilderState";

/** Literal keys, not composed ones: the #320 guardrail only sees what the code names. */
const CONFIDENCE_LABELS = {
  low: "companion_pane_confidence_low",
  medium: "companion_pane_confidence_medium",
  high: "companion_pane_confidence_high",
} as const;

/**
 * One suggested connection, and the three things you can do about it (#411, epic #405).
 *
 * A suggestion is *interpretive* output from a heuristic, so it reaches the note only through an
 * explicit **accept / modify / reject**, and the verdict is recorded (constitution §XII). Accepting
 * used to be the only possible answer, and it recorded nothing.
 *
 * The reason and confidence are **optional and hidden until asked for** — the manifesto is explicit
 * that friction belongs where judgement is at stake, not as a tax on every click.
 */
export function SuggestionRow({
  suggestion,
  onRejected,
}: {
  suggestion: ConnectionSuggestion;
  onRejected: (path: string) => void;
}) {
  const actions = useNoteBuilderStore((store) => store.actions);
  const [verdict, setVerdict] = useState<SuggestionVerdict | undefined>();
  const [alias, setAlias] = useState("");
  const [editing, setEditing] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [reason, setReason] = useState("");

  const record = (
    given: SuggestionVerdict,
    detail?: { note?: string; confidence?: JudgementConfidence }
  ) => {
    actions.judgeSuggestion(suggestion.path, given, detail);
    setVerdict(given);
  };

  const accept = () => {
    actions.insertLink(suggestion.basename);
    record("accepted");
  };

  const modify = () => {
    const label = alias.trim();
    if (!label) return;
    // `Basename|alias` renders as a wikilink with display text when the note is assembled.
    actions.insertLink(`${suggestion.basename}|${label}`);
    record("modified");
    setEditing(false);
  };

  const reject = () => {
    record("rejected");
    onRejected(suggestion.path);
  };

  if (verdict && verdict !== "rejected") {
    return (
      <li className={c("companion-pane-suggestion", "companion-pane-suggestion-decided")}>
        <span className={c("companion-pane-suggestion-verdict")}>
          {t(
            verdict === "accepted"
              ? "companion_pane_verdict_accepted"
              : "companion_pane_verdict_modified",
            suggestion.basename
          )}
        </span>
        <button
          type="button"
          className={c("companion-pane-suggestion-reason-toggle")}
          onClick={() => setDetailOpen(!detailOpen)}
        >
          {t("companion_pane_verdict_add_reason")}
        </button>
        {detailOpen && (
          <div className={c("companion-pane-suggestion-detail")}>
            <input
              type="text"
              value={reason}
              aria-label={t("companion_pane_verdict_reason_label")}
              placeholder={t("companion_pane_verdict_reason_label")}
              onChange={(event) => setReason(event.target.value)}
            />
            <div className={c("companion-pane-suggestion-confidence")}>
              {(["low", "medium", "high"] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => record(verdict, { note: reason.trim() || undefined, confidence: level })}
                >
                  {t(CONFIDENCE_LABELS[level])}
                </button>
              ))}
            </div>
          </div>
        )}
      </li>
    );
  }

  return (
    <li className={c("companion-pane-suggestion")}>
      <button
        type="button"
        className={c("companion-pane-suggestion-open")}
        title={t("companion_pane_open_note")}
        aria-label={t("companion_pane_open_note")}
        onClick={() => {
          void FileService.openFile(suggestion.path);
        }}
      >
        {suggestion.basename}
      </button>
      {editing ? (
        <div className={c("companion-pane-suggestion-detail")}>
          <input
            type="text"
            value={alias}
            autoFocus
            aria-label={t("companion_pane_modify_label")}
            placeholder={t("companion_pane_modify_label")}
            onChange={(event) => setAlias(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") modify();
              if (event.key === "Escape") setEditing(false);
            }}
          />
          <button type="button" onClick={modify}>
            {t("component_confirm")}
          </button>
        </div>
      ) : (
        <div className={c("companion-pane-suggestion-verdicts")}>
          <button
            type="button"
            className={c("companion-pane-suggestion-link")}
            title={t("companion_pane_insert_link")}
            aria-label={t("companion_pane_insert_link")}
            onClick={accept}
          >
            <Icon name="link" />
          </button>
          <button
            type="button"
            title={t("companion_pane_modify_label")}
            aria-label={t("companion_pane_modify_label")}
            onClick={() => setEditing(true)}
          >
            <Icon name="pencil" />
          </button>
          <button
            type="button"
            title={t("companion_pane_reject_label")}
            aria-label={t("companion_pane_reject_label")}
            onClick={reject}
          >
            <Icon name="x" />
          </button>
        </div>
      )}
    </li>
  );
}
