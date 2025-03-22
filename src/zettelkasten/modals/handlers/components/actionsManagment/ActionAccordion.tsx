import React, { useEffect, useRef, useState } from "react";
import { ActionAccordionProps } from "./typing";
import { c } from "architecture";
import { Icon } from "architecture/components/icon";
import { actionsStore } from "architecture/api";
import { Input } from "architecture/components/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { v4 as uuid4 } from "uuid";

/**
 * ActionAccordion component represents a single action item with
 * expandable content and removal animation. It is integrated with dndkit
 * via the useSortable hook.
 *
 * @param props - ActionAccordionProps containing the action data,
 *                removal callback, index and modal.
 * @returns A sortable accordion item.
 */
export function ActionAccordion(props: ActionAccordionProps) {
  const { action, onRemove, modal } = props;
  const [accordionOpen, setAccordionOpen] = useState(false);
  const [animationClass, setAnimationClass] = useState("entrance");

  // Ensure the action has a unique id (legacy support)
  useEffect(() => {
    if (!action.id) {
      action.id = uuid4();
    }
    const timer = setTimeout(() => {
      setAnimationClass("");
    }, 300); // Adjust to your animation duration
    return () => clearTimeout(timer);
  }, [action]);

  // Integrate with dndkit using useSortable
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: action.id });

  // Apply transformation styles provided by dndkit
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  /**
   * Handles the removal animation and triggers onRemove after the animation.
   */
  const handleRemove = () => {
    setAnimationClass("exit");
    setTimeout(() => {
      onRemove();
    }, 300); // Adjust to your animation duration
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${c("accordion")} ${animationClass}`}
    >
      <div className={c("accordion-header")}>
        <div className={c("accordion-header-info")}>
          <a
            href={`${actionsStore.getAction(action.type).link}`}
            style={{ color: "inherit", textDecoration: "none" }}
            title={`${action.type} documentation`}
            className={c("accordion-header-label")}
          >
            <label>{action.type}</label>
            <Icon name={actionsStore.getIconOf(action.type)} />
          </a>
        </div>
        <div className={c("accordion-header-actions")}>
          <Input
            value={action.description}
            placeholder="Action description"
            onChange={(inputValue) => {
              action.description = inputValue;
            }}
            required={true}
            disablePlaceHolderLabel={true}
          />
          <button onClick={() => setAccordionOpen(!accordionOpen)}>
            <Icon
              name={accordionOpen ? "up-chevron-glyph" : "down-chevron-glyph"}
            />
          </button>
          <button
            className={c("accordion-header-remove")}
            onClick={handleRemove}
          >
            <Icon name="cross" />
          </button>
          {/* Drag handle: attaches dndkit listeners for dragging */}
          <div
            className="mobile-option-setting-drag-icon clickable-icon"
            aria-label="Drag to rearrange"
            {...attributes}
            {...listeners}
          >
            <Icon name="lucide-grip-horizontal" />
          </div>
        </div>
      </div>
      <div className={`${c("accordion-body")} ${accordionOpen ? "open" : ""}`}>
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
 * AccordionBody loads additional settings for the action.
 *
 * @param props - Contains modal and action.
 * @returns A div that serves as container for dynamic settings.
 */
function AccordionBody(props: ActionAccordionProps) {
  const { modal, action } = props;
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const body = bodyRef.current;
    if (body) {
      actionsStore.getAction(action.type).settings(body, modal, action);
    }
  }, [modal, action]);

  return <div ref={bodyRef} />;
}
