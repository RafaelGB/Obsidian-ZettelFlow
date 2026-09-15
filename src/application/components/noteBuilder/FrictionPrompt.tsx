import React, { useState } from "react";
import { c } from "architecture";
import { t } from "architecture/lang";

/**
 * Deliberate friction before the suggestions are revealed (#411, epic #405).
 *
 * *"Where judgement is genuinely at stake, invite your reading before revealing the system's."* —
 * the manifesto, which is equally explicit that this **is not a reflection tax on every click**. So
 * it is off by default in the note builder, skippable, and **skipping records nothing**: a skip is
 * not a verdict.
 *
 * What you type is never stored. It exists to make you answer before you read.
 */
export function FrictionPrompt({ onDone }: { onDone: () => void }) {
  const [reading, setReading] = useState("");

  return (
    <div className={c("companion-pane-friction")}>
      <p className={c("companion-pane-friction-question")}>
        {t("companion_pane_friction_question")}
      </p>
      <input
        type="text"
        value={reading}
        aria-label={t("companion_pane_friction_question")}
        onChange={(event) => setReading(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onDone();
        }}
      />
      <div className={c("companion-pane-friction-actions")}>
        <button type="button" className="mod-cta" onClick={onDone}>
          {t("companion_pane_friction_reveal")}
        </button>
        <button type="button" onClick={onDone}>
          {t("companion_pane_friction_skip")}
        </button>
      </div>
    </div>
  );
}
