import { App, Component, MarkdownRenderer } from "obsidian";

export class MarkdownService {
    public static render(
        app: App, content: string, element: HTMLElement,
        sourcePath: string, component: Component
    ) {
        element.empty();
        const dom = element.createDiv();
        dom.addClasses(["markdown-preview-view"]);
        MarkdownRenderer.render(
            app,
            content,
            dom.createDiv(),
            sourcePath,
            component
        );
    }
}