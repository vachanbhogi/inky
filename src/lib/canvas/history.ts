import type { Stroke, Widget } from './types'

// Command interface for undo/redo
export interface HistoryCommand {
  execute(): void
  undo(): void
}

// Concrete command implementations
export class AddStrokeCommand implements HistoryCommand {
  constructor(
    private strokes: () => Stroke[],
    private setStrokes: (strokes: Stroke[]) => void,
    private stroke: Stroke,
  ) {}

  execute() {
    this.setStrokes([...this.strokes(), this.stroke])
  }

  undo() {
    this.setStrokes(this.strokes().filter((s) => s.id !== this.stroke.id))
  }
}

export class DeleteStrokeCommand implements HistoryCommand {
  private deletedStroke: Stroke | null = null

  constructor(
    private strokes: () => Stroke[],
    private setStrokes: (strokes: Stroke[]) => void,
    private strokeId: string,
  ) {}

  execute() {
    this.deletedStroke = this.strokes().find((s) => s.id === this.strokeId) || null
    this.setStrokes(this.strokes().filter((s) => s.id !== this.strokeId))
  }

  undo() {
    if (this.deletedStroke) {
      this.setStrokes([...this.strokes(), this.deletedStroke])
    }
  }
}

export class AddWidgetCommand implements HistoryCommand {
  constructor(
    private widgets: () => Widget[],
    private setWidgets: (widgets: Widget[]) => void,
    private widget: Widget,
  ) {}

  execute() {
    this.setWidgets([...this.widgets(), this.widget])
  }

  undo() {
    this.setWidgets(this.widgets().filter((w) => w.id !== this.widget.id))
  }
}

export class DeleteWidgetCommand implements HistoryCommand {
  private deletedWidget: Widget | null = null

  constructor(
    private widgets: () => Widget[],
    private setWidgets: (widgets: Widget[]) => void,
    private widgetId: string,
  ) {}

  execute() {
    this.deletedWidget = this.widgets().find((w) => w.id === this.widgetId) || null
    this.setWidgets(this.widgets().filter((w) => w.id !== this.widgetId))
  }

  undo() {
    if (this.deletedWidget) {
      this.setWidgets([...this.widgets(), this.deletedWidget])
    }
  }
}

export class BatchDeleteCommand implements HistoryCommand {
  private deletedStrokes: Stroke[] = []
  private deletedWidgets: Widget[] = []

  constructor(
    private strokes: () => Stroke[],
    private setStrokes: (strokes: Stroke[]) => void,
    private widgets: () => Widget[],
    private setWidgets: (widgets: Widget[]) => void,
    private strokeIds: string[],
    private widgetIds: string[],
  ) {}

  execute() {
    this.deletedStrokes = this.strokes().filter((s) => this.strokeIds.includes(s.id))
    this.deletedWidgets = this.widgets().filter((w) => this.widgetIds.includes(w.id))
    this.setStrokes(this.strokes().filter((s) => !this.strokeIds.includes(s.id)))
    this.setWidgets(this.widgets().filter((w) => !this.widgetIds.includes(w.id)))
  }

  undo() {
    this.setStrokes([...this.strokes(), ...this.deletedStrokes])
    this.setWidgets([...this.widgets(), ...this.deletedWidgets])
  }
}

// History manager
const MAX_HISTORY = 50

export class HistoryManager {
  private undoStack: HistoryCommand[] = []
  private redoStack: HistoryCommand[] = []

  push(command: HistoryCommand) {
    command.execute()
    this.undoStack.push(command)
    // Clear redo stack on new action
    this.redoStack = []
    // Trim if over max
    if (this.undoStack.length > MAX_HISTORY) {
      this.undoStack.shift()
    }
  }

  undo(): boolean {
    const command = this.undoStack.pop()
    if (command) {
      command.undo()
      this.redoStack.push(command)
      return true
    }
    return false
  }

  redo(): boolean {
    const command = this.redoStack.pop()
    if (command) {
      command.execute()
      this.undoStack.push(command)
      return true
    }
    return false
  }

  get canUndo() {
    return this.undoStack.length > 0
  }

  get canRedo() {
    return this.redoStack.length > 0
  }

  clear() {
    this.undoStack = []
    this.redoStack = []
  }
}
