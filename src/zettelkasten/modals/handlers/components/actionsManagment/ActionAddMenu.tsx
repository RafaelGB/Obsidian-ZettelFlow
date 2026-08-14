import React, { useMemo, useRef, useState } from "react";
import { ActionAddMenuProps, ActionCardInfo } from "./typing";
import { c } from "architecture";
import { t } from "architecture/lang";
import {
  actionsStore,
  ACTION_CATEGORIES,
  CATEGORY_EMOJI,
  CATEGORY_LABEL_KEY,
} from "architecture/api";
import type { ActionCategory } from "architecture/api/categories/categories";
import { Icon } from "architecture/components/icon";
import { getSuggestedActions } from "./getSuggestedActions";

export function ActionAddMenu(props: ActionAddMenuProps) {
  const { onChange, existingActionIds } = props;
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
          existingActionIds={existingActionIds}
          onChange={(value, isTemplate) => {
            setDisplay(false);
            onChange(value, isTemplate);
          }}
        />
      </div>
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

  const handleChipClick = (card: ActionCardInfo) => {
    onChange(card.id, card.isTemplate || false);
  };

  return (
    <>
      {suggestedCards.length > 0 && (
        <div className={c("action-suggest-row")}>
          <span className={c("action-suggest-row-label")}>
            {t("action_suggest_row_label")}
          </span>
          <div className={c("actions-chip-grid")}>
            {suggestedCards.map((card) => (
              <ActionChip
                key={card.id}
                card={card}
                trigger={() => handleChipClick(card)}
              />
            ))}
          </div>
        </div>
      )}
      <CategoryTabStrip
        activeTab={activeTab}
        isSearching={isSearching}
        onTabChange={(tab) => {
          setActiveTab(tab);
          setSearchTerm("");
        }}
      />
      <input
        className={c("actions-management-add-menu-search")}
        type="text"
        placeholder={t("action_category_uncategorized_label")}
        value={searchTerm}
        onChange={(e) => handleSearch(e.target.value)}
      />
      <div className={c("actions-chip-grid")}>
        {filteredCards.map((card) => (
          <ActionChip
            key={card.id}
            card={card}
            trigger={() => handleChipClick(card)}
          />
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
      className={
        isSearching
          ? c("action-tab-strip", "action-tab-strip--search-mode")
          : c("action-tab-strip")
      }
      role="tablist"
    >
      {ACTION_CATEGORIES.map((cat, index) => (
        <button
          key={cat}
          role="tab"
          aria-selected={!isSearching && activeTab === cat}
          className={
            !isSearching && activeTab === cat
              ? c("action-tab", "action-tab--active")
              : c("action-tab")
          }
          onClick={() => onTabChange(cat)}
          onKeyDown={(e) => handleKeyDown(e, index)}
        >
          <span aria-hidden="true">{CATEGORY_EMOJI[cat]}</span>
          <span>{t(CATEGORY_LABEL_KEY[cat])}</span>
        </button>
      ))}
    </div>
  );
}

function ActionChip(props: { card: ActionCardInfo; trigger: () => void }) {
  const { card } = props;
  const [tooltipOpen, setTooltipOpen] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      className={
        card.isTemplate
          ? c("action-chip", "actions-management-add-card-custom")
          : c("action-chip")
      }
      onClick={() => props.trigger()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          props.trigger();
        }
      }}
      onTouchEnd={(e) => {
        e.preventDefault();
        setTooltipOpen((prev) => !prev);
      }}
    >
      <Icon name={card.icon} />
      <span className={c("action-chip-label")}>{card.label}</span>
      <div
        className={
          tooltipOpen
            ? c("action-chip-tooltip", "action-chip-tooltip--open")
            : c("action-chip-tooltip")
        }
      >
        <p className={c("action-chip-tooltip-purpose")}>{card.purpose}</p>
        {card.link && (
          <a
            href={card.link}
            className={c("action-chip-tooltip-link")}
            onClick={(e) => e.stopPropagation()}
          >
            {t("action_card_docs_link_label")}
          </a>
        )}
      </div>
    </div>
  );
}
