import React from "react";
import { NoteBuilderProps } from "./model/NoteBuilderModel";
import { FileService } from "architecture/plugin";

export function WelcomeTutorial(noteBuilderType: NoteBuilderProps) {
  const { plugin, modal } = noteBuilderType;
  const { settings } = plugin;
  const { canvasFilePath } = settings;
  return (
    <div>
      <h1>Welcome to the Note Builder</h1>
      <span>Configure your canvas</span>
      <ol type="1">
        <li>
          <button
            onClick={() => {
              plugin.app.setting.open();
              plugin.app.setting.openTabById("zettelflow");
            }}
          >
            Open plugin settings
          </button>
        </li>
        {canvasFilePath ? (
          <li>
            <button
              onClick={async () => {
                await FileService.openFile(canvasFilePath);
                modal.close();
              }}
            >
              Open canvas file
            </button>
          </li>
        ) : (
          <p>Create/Select a Canvas file for your workflow</p>
        )}
        <li>
          <p>Add Steps to your Canvas and link them together as you wish</p>
        </li>
        <li>
          <p>
            Steps can be added by dragging and dropping notes from your vault
          </p>
        </li>
        <li>
          <p>
            To make a note as a step with can right click on it and select
            "Transform to Step" or right click on a folder and create a new one
          </p>
        </li>
      </ol>
    </div>
  );
}
