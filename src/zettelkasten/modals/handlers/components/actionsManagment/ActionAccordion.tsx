import React, { useEffect, useRef, useState } from "react";
import { ActionAccordionProps } from "./typing";
import { c } from "architecture";
import { t } from "architecture/lang";
import { Icon } from "architecture/components/icon";
import { actionsStore } from "architecture/api";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { v7 as uuid7 } from "uuid";

/** How long the leave animation runs before the card is really removed. */
const LEAVE_MS = 200;

/**
 * One action of a step, as a card (#685): a handle, the action's icon and **human name** — *Ask for
 * text*, not `prompt` — the description you give it, editable in place, and three quiet controls
 * (documentation, open, remove). It replaces an accent-filled bar whose only label was the action's
 * id. Sortable through dnd-kit; the handle is the only drag target.
 */
export function ActionAccordion(props: ActionAccordionProps) {
  const { action, onRemove, modal } = props;
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // Ensure the action has a unique id (legacy support)
  useEffect(() => {
    if (!action.id) {
      action.id = uuid7();
    }
  }, [action]);

  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: action.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleRemove = () => {
    setLeaving(true);
    window.setTimeout(() => onRemove(), LEAVE_MS);
  };

  const knownAction = actionsStore.getActionsKeys().includes(action.type)
    ? actionsStore.getAction(action.type)
    : null;
  const name = knownAction?.getLabel() ?? action.type;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={c("action-card", open ? "action-card-open" : "", leaving ? "action-card-leaving" : "")}
    >
      <div className={c("action-card-header")}>
        <span
          className={`clickable-icon ${c("action-card-grip")}`}
          aria-label={t("step_builder_action_drag_handle")}
          {...attributes}
          {...listeners}
        >
          <Icon name="grip-vertical" />
        </span>
        <span className={c("action-card-icon")}>
          <Icon name={knownAction ? actionsStore.getIconOf(action.type) : "box"} />
        </span>
        <div className={c("action-card-text")}>
          <button
            type="button"
            className={c("action-card-name")}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {name}
          </button>
          <input
            type="text"
            className={c("action-card-description")}
            defaultValue={action.description ?? ""}
            placeholder={t("step_builder_action_description_placeholder")}
            aria-label={t("step_builder_action_description_placeholder")}
            onChange={(event) => {
              action.description = event.target.value;
            }}
          />
        </div>
        {knownAction?.link && (
          <a
            href={knownAction.link}
            className={`clickable-icon ${c("action-card-docs")}`}
            aria-label={t("step_builder_action_documentation", name)}
          >
            <Icon name="book-open" />
          </a>
        )}
        <button
          type="button"
          className={`clickable-icon ${c("action-card-toggle")}`}
          aria-label={t("step_builder_action_toggle")}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <Icon name="chevron-right" />
        </button>
        <button
          type="button"
          className={`clickable-icon ${c("action-card-remove")}`}
          aria-label={t("remove_action_button_title")}
          onClick={handleRemove}
        >
          <Icon name="x" />
        </button>
      </div>
      <div className={c("action-card-body")} hidden={!open}>
        <AccordionBody
          modal={modal}
          action={action}
          index={props.index}
          onRemove={onRemove}
        />
      </div>
    </div>
  );
}

/**
 * The action's own settings, drawn by the action into a plain container. Rendered once and kept
 * while the card is closed, so a half-typed field survives folding it.
 */
function AccordionBody(props: ActionAccordionProps) {
  const { modal, action } = props;
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    if (actionsStore.getActionsKeys().includes(action.type)) {
      actionsStore.getAction(action.type).settings(body, modal, action);
    }
  }, [modal, action]);

  return <div ref={bodyRef} />;
}
