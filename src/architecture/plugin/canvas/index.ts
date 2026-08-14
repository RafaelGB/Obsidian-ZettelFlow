import AddManagedStepExtension from './extensions/AddManagedStepExtension';
import CanvasExtension from './extensions/CanvasExtension';
import CanvasPatcher from './extensions/CanvasPatcher';
import ConditionEditorExtension from './extensions/ConditionEditorExtension';
import EditStepCanvasExtension from './extensions/EditCanvasExtension';
import EmptyStateExtension from './extensions/EmptyStateExtension';
import WorkflowLegibilityExtension from './extensions/WorkflowLegibilityExtension';
import type ZettelFlow from 'main';

/** Concrete, instantiable canvas-extension constructor (CanvasExtension itself is abstract). */
export type CanvasExtensionConstructor = new (plugin: ZettelFlow) => CanvasExtension;

export { canvas } from './Canvas';

export { Flow, FlowNode } from './typing';

export { canvasJsonFormatter } from './formatter';

const allCanvasExtensions: CanvasExtensionConstructor[] = [
    EditStepCanvasExtension,
    AddManagedStepExtension,
    WorkflowLegibilityExtension,
    ConditionEditorExtension,
    EmptyStateExtension,
];

export { allCanvasExtensions, CanvasExtension, CanvasPatcher };