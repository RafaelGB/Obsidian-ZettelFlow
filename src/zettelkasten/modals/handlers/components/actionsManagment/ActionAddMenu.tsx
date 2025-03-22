import React, { useMemo, useState } from "react";
import { ActionAddMenuProps, ActionCardInfo } from "./typing";
import { c } from "architecture";
import { actionsStore } from "architecture/api";
import { Icon } from "architecture/components/icon";

/**
 * ActionAddMenu component renders a button that toggles the action selector menu.
 *
 * @param props - ActionAddMenuProps including the modal and onChange callback.
 * @returns The add action menu interface.
 */
export function ActionAddMenu(props: ActionAddMenuProps) {
  const { onChange } = props;
  const [display, setDisplay] = useState(false);

  return (
    <div className={c("actions-management-add")}>
      <button
        className={
          display
            ? c("actions-management-add-button-active")
            : c("actions-management-add-button")
        }
        onClick={() => setDisplay(!display)}
      >
        <Icon name="plus" />
      </button>
      <div
        className={
          display
            ? c("actions-management-add-menu-show")
            : c("actions-management-add-menu")
        }
      >
        <ActionCardsMenu
          modal={props.modal}
          onChange={(value, isTemplate) => {
            setDisplay(false);
            onChange(value, isTemplate);
          }}
        />
      </div>
    </div>
  );
}

/**
 * ActionCardsMenu renders the list of available actions for selection.
 *
 * @param props - Contains modal and onChange callback.
 * @returns The searchable list of action cards.
 */
function ActionCardsMenu(props: ActionAddMenuProps) {
  const { onChange, modal } = props;
  const { actions } = modal.getPlugin().settings.installedTemplates;

  // Build the list of action cards by merging built-in and template actions.
  const actionsMemo: ActionCardInfo[] = useMemo(() => {
    const array: ActionCardInfo[] = [];
    actionsStore.getActionsKeys().forEach((key) => {
      const rawAction = actionsStore.getAction(key);
      array.push({
        icon: rawAction.getIcon(),
        label: rawAction.getLabel(),
        link: rawAction.link,
        purpose: rawAction.purpose,
        id: rawAction.id,
      });
    });
    Object.values(actions).forEach((action) => {
      array.push({
        icon: actionsStore.getAction(action.type).getIcon(),
        label: action.title,
        purpose: action.description,
        id: action.id,
        isTemplate: true,
      });
    });
    return array;
  }, []);

  const [filteredCards, setFilteredCards] = useState(actionsMemo);

  return (
    <>
      <input
        className={c("actions-management-add-menu-search")}
        type="text"
        placeholder="Search actions"
        onChange={(e) => {
          const value = e.target.value.toLowerCase();
          setFilteredCards(
            value === ""
              ? actionsMemo
              : actionsMemo.filter(
                  (card) =>
                    card.label.toLowerCase().includes(value) ||
                    card.purpose.toLowerCase().includes(value)
                )
          );
        }}
      />
      <div className={c("actions-list")}>
        {filteredCards.map((card) => (
          <ActionCard
            key={card.id}
            card={card}
            trigger={() => {
              setFilteredCards(actionsMemo);
              onChange(card.id, card.isTemplate || false);
            }}
          />
        ))}
      </div>
    </>
  );
}

/**
 * ActionCard represents a single action option in the add menu.
 *
 * @param props - Contains the action card info and a trigger callback.
 * @returns A clickable action card.
 */
function ActionCard(props: { card: ActionCardInfo; trigger: () => void }) {
  const { card } = props;
  return (
    <div
      className={
        card.isTemplate
          ? c(
              "actions-management-add-card",
              "actions-management-add-card-custom"
            )
          : c("actions-management-add-card")
      }
      onClick={() => props.trigger()}
    >
      <div className={c("actions-management-add-card-icon")}>
        <Icon name={card.icon} />
      </div>
      <div className={c("actions-management-add-card-header")}>
        <label>{card.label}</label>
      </div>
      <div className={c("actions-management-add-card-body")}>
        <label>{card.purpose}</label>
      </div>
      <a
        href={card.link}
        title={`${card.label} documentation`}
        className={c("actions-management-add-card-link")}
        onClick={(e) => e.stopPropagation()}
      >
        <Icon name="info" />
      </a>
    </div>
  );
}
