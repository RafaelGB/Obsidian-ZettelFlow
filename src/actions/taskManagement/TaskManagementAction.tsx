import { CustomZettelAction, ExecuteInfo } from "architecture/api";
import { FileService } from "architecture/plugin";
import { Notice, TFile } from "obsidian";
import { taskManagementSettings } from "./TaskManagementSettings";
import { TaskManagementElement } from "./typing";
import { t } from "architecture/lang";
import { log } from "architecture";

export class TaskManagementAction extends CustomZettelAction {
  private static ICON = "list-checks";
  id = "task-management";
  defaultAction = {
    type: this.id,
    description: "Task Management",
    hasUI: false,
    id: this.id,
  };

  settings = taskManagementSettings;

  getIcon(): string {
    return TaskManagementAction.ICON;
  }

  async execute(info: ExecuteInfo): Promise<void> {
    const { content } = info;
    const {
      initialFolder,
      regex,
      rollupHeader,
      prefix = "",
      suffix = "",
    } = info.element as TaskManagementElement;
    const initFilesToSearch = FileService.getTfilesFromFolder(
      initialFolder || "/",
      ["md"]
    );

    log.debug(`Initial files to search: ${initFilesToSearch.length}`);
    // Filter by regex
    const compiledRegex = new RegExp(regex);
    const filesToSearch = initFilesToSearch.filter((file) =>
      file.basename.match(compiledRegex)
    );
    log.debug(`Files to search after regex: ${filesToSearch.length}`);

    // Get all unfinished todos
    const unfinishedTodos = [];
    for (const file of filesToSearch) {
      const todos = await getAllUnfinishedTodos(file, rollupHeader);
      unfinishedTodos.push(...todos);
    }
    const normalizedTodos = unfinishedTodos
      .map((task) => `${prefix}${task}${suffix}`)
      .join("\n");

    if (normalizedTodos.length !== 0) {
      content.add(`${rollupHeader}\n${normalizedTodos}`);
    }
  }

  getLabel(): string {
    return t("type_option_task_management");
  }
}

const getAllUnfinishedTodos = async (file: TFile, tasksHeader: string) => {
  const contents = await FileService.getContent(file);
  const contentsForDailyTasks = contents.split(tasksHeader)[1] || contents;
  const unfinishedTodosRegex = /\t*- \[ \].*/g;
  const unfinishedTodos = Array.from(
    contentsForDailyTasks.matchAll(unfinishedTodosRegex)
  ).map(([todo]) => todo);
  const fileWithoutTasks = contents.split(/.*\t*- \[ \].*\n?/g).join("");
  await FileService.modify(file, fileWithoutTasks);
  new Notice(
    `Rollover ${unfinishedTodos.length} unfinished task/s from ${file.basename}`
  );
  return unfinishedTodos;
};
