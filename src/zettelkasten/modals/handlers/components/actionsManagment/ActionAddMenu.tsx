import React, { useMemo, useRef, useState } from "react";
import { ActionAddMenuProps, ActionCardInfo } from "./typing";
import { c } from "architecture";
import { t } from "architecture/lang";
import {
  actionsStore,
  ACTION_CATEGORIES,
  CATEGORY_ICON,
  CATEGORY_LABEL_KEY,
} from "architecture/api";
import type { ActionCategory } from "architecture/api/categories/categories";
import { Icon } from "architecture/components/icon";
import { getSuggestedActions } from "./getSuggestedActions";

/**
 * Adding an action (#685): one labelled button, and a panel that opens in place — suggestions for
 * this step first, then search, then the five categories with their Lucide icons and a tidy grid.
 * It replaced a bare `+` and a floating menu whose categories were emoji.
 */
export function ActionAddMenu(props: ActionAddMenuProps) {
  const { onChange, existingActionIds } = props;
  const [display, setDisplay] = useState(false);

  if (!display) {
    return (
      <button
        type="button"
        className={c("action-add-button")}
        onClick={() => setDisplay(true)}
      >
        <Icon name="plus" />
        <span>{t("step_builder_add_action")}</span>
      </button>
    );
  }

  return (
    <div className={c("action-add-panel")}>
      <div className={c("action-add-panel-head")}>
        <span className={c("action-add-panel-title")}>{t("step_builder_add_action")}</span>
        <button
          type="button"
          className="clickable-icon"
          aria-label={t("step_builder_add_action_close")}
          onClick={() => setDisplay(false)}
        >
          <Icon name="x" />
        </button>
      </div>
      <ActionCardsMenu
        modal={props.modal}
        existingActionIds={existingActionIds}
        onChange={(value, isTemplate) => {
          setDisplay(false);
          onChange(value, isTemplate);
        }}
      />
    </div>
  );
}

function ActionCardsMenu(props: ActionAddMenuProps) {
  const { onChange, modal, existingActionIds = [] } = props;
  const actions = modal.getPlugin().settings.installedTemplates?.actions ?? {};

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
        category: rawAction.category,
      });
    });
    Object.values(actions).forEach((action) => {
      if (!actionsStore.getActionsKeys().includes(action.type)) return;
      const baseAction = actionsStore.getAction(action.type);
      array.push({
        icon: baseAction.getIcon(),
        label: action.title,
        purpose: action.description,
        id: action.id,
        isTemplate: true,
        category: baseAction.category,
      });
    });
    return array;
  }, []);

  const [activeTab, setActiveTab] = useState<ActionCategory>("manipulation");
  const preSearchTab = useRef<ActionCategory>("manipulation");
  const [searchTerm, setSearchTerm] = useState("");
  const isSearching = searchTerm.length > 0;

  const filteredCards = useMemo(() => {
    if (isSearching) {
      const lower = searchTerm.toLowerCase();
      return actionsMemo.filter(
        (card) =>
          card.label.toLowerCase().includes(lower) ||
          (card.purpose ?? "").toLowerCase().includes(lower)
      );
    }
    return actionsMemo.filter((card) => card.category === activeTab);
  }, [actionsMemo, searchTerm, activeTab, isSearching]);

  const suggestedCards = useMemo(
    () => getSuggestedActions(existingActionIds, actionsMemo),
    [existingActionIds, actionsMemo]
  );

  const handleSearch = (value: string) => {
    if (value.length > 0 && !isSearching) {
      preSearchTab.current = activeTab;
    }
    if (value.length === 0 && isSearching) {
      setActiveTab(preSearchTab.current);
    }
    setSearchTerm(value);
  };

  const pick = (card: ActionCardInfo) => onChange(card.id, card.isTemplate || false);

  return (
    <>
      {suggestedCards.length > 0 && (
        <div className={c("action-suggest-row")}>
          <Icon name="sparkles" />
          <span className={c("action-suggest-row-label")}>
            {t("action_suggest_row_label")}
          </span>
          {suggestedCards.map((card) => (
            <button
              type="button"
              key={card.id}
              className={c("action-suggest-chip")}
              onClick={() => pick(card)}
            >
              {card.label}
            </button>
          ))}
        </div>
      )}
      <div className={c("action-search")}>
        <Icon name="search" />
        <input
          type="search"
          placeholder={t("action_search_placeholder")}
          aria-label={t("action_search_placeholder")}
          value={searchTerm}
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>
      <CategoryTabStrip
        activeTab={activeTab}
        isSearching={isSearching}
        onTabChange={(tab) => {
          setActiveTab(tab);
          setSearchTerm("");
        }}
      />
      <div className={c("action-tiles")}>
        {filteredCards.map((card) => (
          <ActionTile key={card.id} card={card} trigger={() => pick(card)} />
        ))}
      </div>
    </>
  );
}

function CategoryTabStrip(props: {
  activeTab: ActionCategory;
  isSearching: boolean;
  onTabChange: (tab: ActionCategory) => void;
}) {
  const { activeTab, isSearching, onTabChange } = props;

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    const tabs = ACTION_CATEGORIES;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      onTabChange(tabs[(index + 1) % tabs.length]);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      onTabChange(tabs[(index - 1 + tabs.length) % tabs.length]);
    }
  };

  return (
    <div
      className={c("action-tab-strip", isSearching ? "action-tab-strip-searching" : "")}
      role="tablist"
    >
      {ACTION_CATEGORIES.map((cat, index) => {
        const on = !isSearching && activeTab === cat;
        return (
          <button
            type="button"
            key={cat}
            role="tab"
            aria-selected={on}
            className={c("action-tab", on ? "action-tab-active" : "")}
            onClick={() => onTabChange(cat)}
            onKeyDown={(e) => handleKeyDown(e, index)}
          >
            <Icon name={CATEGORY_ICON[cat]} />
            <span>{t(CATEGORY_LABEL_KEY[cat])}</span>
          </button>
        );
      })}
    </div>
  );
}

/** One action you can add: its icon, its name, and what it is for, in a line under the name. */
function ActionTile(props: { card: ActionCardInfo; trigger: () => void }) {
  const { card } = props;
  return (
    <button
      type="button"
      className={c("action-tile", card.isTemplate ? "action-tile-template" : "")}
      onClick={() => props.trigger()}
    >
      <span className={c("action-tile-icon")}>
        <Icon name={card.icon} />
      </span>
      <span className={c("action-tile-text")}>
        <span className={c("action-tile-name")}>
          {card.label}
          {card.isTemplate && (
            <span className={c("action-tile-badge")}>{t("step_builder_action_template_badge")}</span>
          )}
        </span>
        {card.purpose && <span className={c("action-tile-purpose")}>{card.purpose}</span>}
      </span>
    </button>
  );
}
