import React, { useMemo, useState } from "react";
import { ActionAddMenuProps, ActionCardInfo } from "./typing";
import { c } from "architecture";
import { actionsStore } from "architecture/api";
import { Icon } from "architecture/components/icon";

export function ActionAddMenu(props: ActionAddMenuProps) {
  const { onChange } = props;
  // Open/close action selector menu
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
          onChange={(value: string | null) => {
            setDisplay(false);
            onChange(value);
          }}
        />
      </div>
    </div>
  );
}

function ActionCardsMenu(props: ActionAddMenuProps) {
  const { onChange, modal } = props;
  const { actions } = modal.getPlugin().settings.installedTemplates;
  // Hooks
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
    console.log(actions);
    // Merge the actions with the installed actions
    Object.values(actions).forEach((action) => {
      array.push({
        icon: "pen",
        label: action.title,
        purpose: action.description,
        id: action.id,
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
          if (value === "" || value === null) {
            setFilteredCards(actionsMemo);
          } else {
            setFilteredCards(
              actionsMemo.filter((card) =>
                card.label.toLowerCase().includes(value)
              )
            );
          }
        }}
      />
      <div className={c("actions-list")}>
        {filteredCards.map((card) => (
          <ActionCard
            key={card.id}
            card={card}
            trigger={() => {
              setFilteredCards(actionsMemo);
              onChange(card.id);
            }}
          />
        ))}
      </div>
    </>
  );
}
/**
 * Core actions of ZettelFlow
 * @param props
 * @returns
 */
function ActionCard(props: { card: ActionCardInfo; trigger: () => void }) {
  const { card } = props;
  return (
    <div
      className={c("actions-management-add-card")}
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
