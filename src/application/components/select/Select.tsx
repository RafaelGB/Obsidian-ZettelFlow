import React, { CSSProperties, useEffect, useId, useMemo, useRef, useState } from "react";
import { OptionElementType, SelectType } from "./typing";
import { c } from "architecture";
import { t } from "architecture/lang";
import { Platform } from "obsidian";
import { Icon } from "architecture/components/icon";
import { actionsStore } from "architecture/api";
import { groupOptionsByPhase, PHASE_LABEL_KEY } from "zettelkasten/phases";
import {
  INITIAL_OPTION_LIST_STATE,
  optionDomId,
  reduceOptionListKey,
} from "./optionListModel";

/**
 * The wizard's option list, as a real **listbox** (#407, epic #405).
 *
 * One tab stop on the container, `aria-activedescendant` pointing at the active option, and every
 * movement decided by the pure reducer in `optionListModel` (arrows with wrap, Home/End, page, Enter
 * *and* Space, typeahead). Options are plain `role="option"` elements with no `tabindex` of their own —
 * the previous `tabIndex={index}` put a positive tabindex on every row and hijacked the modal's tab
 * order.
 */
export function Select(selectType: SelectType) {
  const {
    options,
    callback,
    className = [],
    autofocus = false,
    label,
  } = selectType;
  const [selected, setSelected] = useState<string>("");
  const [searchValue, setSearchValue] = useState<string>("");
  const [optionsState, setOptionsState] = useState(options);
  const [listState, setListState] = useState(INITIAL_OPTION_LIST_STATE);
  const listId = useId();

  const internalCallback = (selectedOption: string) => {
    setSelected(selectedOption);
    callback(selectedOption);
  };

  const groupRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!autofocus) return;
    if (Platform.isMobile && searchRef.current) {
      searchRef.current.focus();
    } else if (groupRef.current) {
      groupRef.current.focus();
    }
  }, [autofocus]);

  const activeOption =
    listState.activeIndex >= 0 && listState.activeIndex < optionsState.length
      ? optionsState[listState.activeIndex]
      : undefined;

  // Keep the active option visible without moving focus off the listbox.
  useEffect(() => {
    if (!activeOption || !groupRef.current) return;
    const el = groupRef.current.querySelector<HTMLElement>(
      `[data-option-key="${CSS.escape(activeOption.key)}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeOption]);

  // Group by knowledge phase (#149); null = no option is phased → render a flat list (legacy look).
  const phaseGroups = groupOptionsByPhase(optionsState);
  const listLabel = label ?? t("note_builder_options_label");

  const renderOption = (option: (typeof optionsState)[number], index: number) => (
    <OptionElement
      option={option}
      index={index}
      domId={optionDomId(listId, option.key)}
      callback={internalCallback}
      isSelected={selected === option.key}
      isActive={activeOption?.key === option.key}
      key={`option-${option.key}-${index}`}
    />
  );

  return (
    <div className={c("select-group", ...className)}>
      <input
        type="text"
        ref={searchRef}
        value={searchValue}
        aria-label={t("note_builder_search_placeholder")}
        aria-controls={listId}
        placeholder={t("note_builder_search_placeholder")}
        onChange={(event) => {
          const value = event.target.value;
          setOptionsState(
            options.filter((option) =>
              option.label.toLowerCase().includes(value.toLowerCase())
            )
          );
          setSearchValue(value);
          setListState(INITIAL_OPTION_LIST_STATE);
        }}
      />
      <div
        id={listId}
        role="listbox"
        aria-label={listLabel}
        aria-activedescendant={
          activeOption ? optionDomId(listId, activeOption.key) : undefined
        }
        tabIndex={0}
        ref={groupRef}
        onKeyDown={(event) => {
          const result = reduceOptionListKey(listState, optionsState, {
            key: event.key,
            at: event.timeStamp,
          });
          if (!result.handled) return;
          setListState(result.state);
          if (result.effect.kind === "activate") {
            event.preventDefault();
            internalCallback(result.effect.key);
            return;
          }
          if (result.effect.kind === "close-search") {
            // Escape clears a filter in progress; with nothing to clear it belongs to the modal.
            if (searchValue.length > 0) {
              event.stopPropagation();
              setSearchValue("");
              setOptionsState(options);
            }
            return;
          }
          event.preventDefault();
        }}
      >
        {phaseGroups
          ? phaseGroups.map((group) => (
              <React.Fragment key={`phase-${group.phase ?? "unphased"}`}>
                <div className={c("select-group-phase-header")} role="presentation">
                  {group.phase
                    ? t(PHASE_LABEL_KEY[group.phase])
                    : t("step_phase_unphased")}
                </div>
                {group.options.map((option) =>
                  renderOption(option, optionsState.indexOf(option))
                )}
              </React.Fragment>
            ))
          : optionsState.map((option, index) => renderOption(option, index))}
      </div>
    </div>
  );
}

function OptionElement(optionElementType: OptionElementType) {
  const { option, isSelected, isActive, domId, callback } = optionElementType;
  const { actionTypes, key, label, tooltip } = option;
  const styleMemo = useMemo<CSSProperties>(() => {
    return {
      "--canvas-color": option.color,
    } as CSSProperties;
  }, [option.color]);

  const classes = [c("option")];
  if (isSelected) classes.push(c("selected"));
  if (isActive) classes.push(c("option-active"));

  return (
    <div
      id={domId}
      role="option"
      aria-selected={isSelected}
      data-option-key={key}
      title={tooltip}
      className={classes.join(" ")}
      onClick={(mouseEvent) => {
        mouseEvent.stopPropagation();
        callback(key);
      }}
      style={styleMemo}
    >
      <label>{label}</label>
      <div className={c("icon-group")}>
        {actionTypes.map((elementType, index) => (
          <ActionIcon type={elementType} key={`icon-${index}`} />
        ))}
      </div>
    </div>
  );
}

function ActionIcon(info: { type: string }) {
  const { type } = info;
  return <Icon name={`${actionsStore.getIconOf(type)}`} />;
}
