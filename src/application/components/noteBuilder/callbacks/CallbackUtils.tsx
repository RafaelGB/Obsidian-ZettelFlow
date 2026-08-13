import { CallbackPickedState, NoteBuilderType } from "../typing";
import { ActionSelector } from "../ActionSelector";
import React from "react";
import { ElementSelector } from "../ElementSelector";
import { Notice } from "obsidian";
import { FatalError, WarningError, ZettelError, log } from "architecture";
import { FileService } from "architecture/plugin";
import { ObsidianApi } from "architecture";
import { FlowNode } from "architecture/plugin/canvas";
import { t } from "architecture/lang";
import { ProgressBar } from "architecture/components/core";
import { HistoryView } from "architecture/components/core/historyView/HistoryView";
import { evaluateEdgeGate, EvalContext } from "application/notes/conditionEvaluator";
import { isWaitNode, WaitMachine } from "architecture/plugin/workflow";
import { WaitPromptModal } from "zettelkasten/modals/WaitPromptModal";

export async function nextElement(
  state: CallbackPickedState,
  selected: string,
  info: NoteBuilderType
) {
  const { data, actions } = state;
  const { flow } = info;

  const selectedNode = await flow.get(selected);
  actions.setCurrentNode(selectedNode);
  actions.setActiveContext(info.modal.getCanvasName(), selectedNode.label);

  // How the wizard proceeds once this node is cleared to run (WAIT gates this).
  const proceed = () => {
    if (selectedNode.actions.length > 0 && !data.wasActionTriggered()) {
      manageAction(selectedNode, state, info, 0);
    } else {
      void manageElement(selectedNode, state, info);
    }
  };

  // WAIT block (#151): suspend the wizard on a human-confirmation pause. The pure WaitMachine
  // guarantees we advance at most once; closing the prompt without confirming aborts (fail safe —
  // no build, no mutation). No cross-restart persistence: a pending WAIT is simply dropped.
  if (isWaitNode(selectedNode)) {
    const machine = new WaitMachine();
    machine.reachWait();
    log.info(`[workflow] WAIT reached at "${selectedNode.label}" — suspending`);
    const message = selectedNode.wait?.message || t("workflow_wait_prompt_default_message");
    new WaitPromptModal(
      info.plugin.app,
      message,
      () => {
        if (machine.confirm()) {
          log.info(`[workflow] WAIT resumed at "${selectedNode.label}"`);
          proceed();
        }
      },
      () => {
        machine.cancel();
        log.warn(`[workflow] WAIT cancelled at "${selectedNode.label}" — aborting workflow`);
        info.modal.close();
      }
    ).open();
    return;
  }

  proceed();
}

export function manageAction(
  selectedElement: FlowNode,
  state: CallbackPickedState,
  info: NoteBuilderType,
  position: number
) {
  const { actions } = state;
  const action = selectedElement.actions[position];
  if (selectedElement.actions.length <= position) {
    log.debug(`No more actions for element: "${selectedElement.label}"`);
    void nextElement(state, selectedElement.id, info);
  } else if (action.hasUI) {
    actions.setSectionElement(
      <ActionSelector
        key={`selector-action-${selectedElement.id}-${position}`}
        {...info}
        action={action}
        node={selectedElement}
        position={position}
      />,
      {
        actionType: action.type,
        isOptional: selectedElement.optional,
        savePrevious: true,
      }
    );
    actions.setHeader({
      title: action.description || `${action.type} action`,
    });
  } else {
    // Background element
    log.debug(`Action is a background element: "${action.description}"`);
    actions.addBackgroundAction(action);
    manageAction(selectedElement, state, info, position + 1);
  }
}

export async function manageElement(
  selectedElement: FlowNode,
  state: CallbackPickedState,
  info: NoteBuilderType,
  skipChildrens = false
) {
  const { actions } = state;
  if (selectedElement.extension === "js" && selectedElement.path) {
    await actions.addJsFile(selectedElement.path);
  } else {
    actions.manageNodeInfo(selectedElement);
  }

  const { modal, flow } = info;
  const rawChildren = skipChildrens
    ? []
    : await flow.childrensOf(selectedElement.id);
  const evalCtx = buildEvalContext(state, info);
  const childrens = filterConditionalEdges(rawChildren, evalCtx);

  if (childrens.length > 1) {
    // Element Selector
    const childrenHeader = selectedElement.childrenHeader;
    actions.setSectionElement(
      <ElementSelector
        key={`selector-children-${childrenHeader}`}
        {...info}
        childen={childrens}
      />,
      {
        isOptional: false,
      }
    );
    actions.setHeader({
      title: childrenHeader || t("default_selector_title"),
    });
  } else if (childrens.length === 1) {
    actions.setActionWasTriggered(false);
    void nextElement(state, childrens[0].id, info);
  } else {
    actions.setVisualSection({
      element: <ProgressBar key="progress-bar" label="Loading..." />,
      color: "info",
    });
    // Build and close modal
    actions
      .build(info.modal)
      .then(async (path) => {
        actions.setActiveContext("", "");
        if (!modal.isEditor()) {
          HistoryView.record(info.plugin.app, info.plugin, path, info.modal.getCanvasName()
            ? info.flow.canvasPath
            : "");
          void FileService.openFile(path);
        }
        modal.close();
      })
      .catch((error: ZettelError) => {
        log.error(error);
        if (error instanceof ZettelError) {
          switch (error.getType()) {
            case ZettelError.WARNING_TYPE: {
              new Notice(`Warning error: ${error.message}`);
              manageWarningError(actions, error);
            }
            // falls through
            case ZettelError.FATAL_TYPE: {
              new Notice(`Fatal error: ${error.message}`);
              manageFatalError(actions, error);
              break;
            }
            default: {
              new Notice(`Not controlled error: ${error.message}`);
              modal.close();
            }
          }
        } else {
          new Notice(`Not controlled error: ${String(error)}`);
        }
      });
  }
}

function buildEvalContext(state: CallbackPickedState, info: NoteBuilderType): EvalContext {
  const sourceFile = info.modal.getSourceFile();
  const frontmatter: Record<string, unknown> = sourceFile
    ? (ObsidianApi.globalApp().metadataCache.getFileCache(sourceFile)?.frontmatter ?? {})
    : {};
  return {
    frontmatter,
    noteTitle: state.data.getTitle(),
    canvasName: info.modal.getCanvasName(),
  };
}

function filterConditionalEdges(children: FlowNode[], ctx: EvalContext): FlowNode[] {
  // IF block (#151): each edge is gated by the #119 evaluator via evaluateEdgeGate. A malformed
  // expression safe-opens and is surfaced (Notice + debug log) rather than silently dropping a branch.
  return children.filter((child) => {
    const { open, invalid } = evaluateEdgeGate(child.tooltip, ctx);
    if (invalid) {
      log.debug(`[workflow] invalid IF condition on edge to "${child.label}" — opening (safe)`);
      new Notice(t("edge_condition_invalid_expression"));
    }
    return open;
  });
}

function manageFatalError(
  actions: CallbackPickedState["actions"],
  error: FatalError
) {
  switch (error.getCode()) {
    case FatalError.INVALID_TITLE: {
      actions.setInvalidTitle(true);
      break;
    }
    default: {
      log.warn("Unknown fatal error");
    }
  }
}

function manageWarningError(
  _: CallbackPickedState["actions"],
  error: WarningError
) {
  switch (error.getCode()) {
    default: {
      log.warn("Unknown fatal error");
    }
  }
}
