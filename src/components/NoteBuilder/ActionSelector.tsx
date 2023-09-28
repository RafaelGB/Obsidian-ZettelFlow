import React, { useMemo } from "react";
import {
  ActionBuilderProps,
  WrappedActionBuilderProps,
} from "./model/NoteBuilderModel";
import { Calendar, Dropdown, TextArea } from "components/core";
import { TypeService } from "architecture/typing";
import { callbackActionBuilder } from "./callbacks/CallbackNote";
import { useNoteBuilderStore } from "./state/NoteBuilderState";
import { SelectorElement } from "zettelkasten";

export function ActionSelector(actionProps: ActionBuilderProps) {
  const { action } = actionProps;

  const actions = useNoteBuilderStore((state) => state.actions);
  const data = useNoteBuilderStore((state) => state.data);
  const position = useNoteBuilderStore((state) => state.position);
  const callbackMemo = useMemo(() => {
    return callbackActionBuilder(
      {
        actions,
        data,
      },
      actionProps
    );
  }, []);
  const element = actionOptions.get(action.element.type);
  if (!element) {
    return (
      <div key={"not-supported-action"}>
        Error: {action.element.type} not supported
      </div>
    );
  }

  return (
    <div key={`action-step-${position}`}>
      {element({ ...actionProps, callback: callbackMemo })}
    </div>
  );
}

const actionOptions: Map<
  string,
  (props: WrappedActionBuilderProps) => JSX.Element
> = new Map([
  ["prompt", (props) => <PromptWrapper {...props} />],
  ["calendar", (props) => <CalendarWrapper {...props} />],
  ["selector", (props) => <SelectorWrapper {...props} />],
]);

function PromptWrapper(props: WrappedActionBuilderProps) {
  const { action, callback } = props;
  return (
    <TextArea
      className={["display-grid"]}
      placeholder={
        TypeService.isString(action.element.placeholder)
          ? action.element.placeholder
          : ""
      }
      onKeyDown={(key, value) => {
        if (key === "Enter") {
          callback(value);
        }
      }}
      key={"prompt-action"}
    />
  );
}

function CalendarWrapper(props: WrappedActionBuilderProps) {
  const { callback } = props;
  return (
    <Calendar
      onConfirm={(value) => {
        callback(value);
      }}
    />
  );
}

function SelectorWrapper(props: WrappedActionBuilderProps) {
  const { callback, action } = props;
  const { options, defaultOption } = action.element as SelectorElement;
  return (
    <Dropdown
      options={options}
      defaultValue={defaultOption || Object.keys(options)[0]}
      onConfirm={(value) => {
        callback(value);
      }}
    />
  );
}
