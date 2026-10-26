import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createRoot, type Root } from 'react-dom/client'
import { inkyStore } from '../../lib/canvas/store'
import { boardCatalog } from '../../lib/document/boardCatalog'
import { MathActionCapsule } from './MathActionCapsule'
import { WorksheetBackgroundLayer } from './WorksheetBackgroundLayer'

let roots: Root[] = []
let containers: HTMLDivElement[] = []

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

async function mount(node: React.ReactNode) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  roots.push(root)
  containers.push(el)
  root.render(node)
  await flush()
}

function button(label: string): HTMLButtonElement | null {
  return (
    [...document.querySelectorAll('button')].find(
      (b) =>
        b.textContent === label ||
        b.getAttribute('aria-label') === label ||
        (label === 'Hint' && (b.textContent === 'Next Step' || b.getAttribute('data-testid') === 'action-hint')),
    ) ?? null
  )
}

describe('Socratic Capsule Coach Tray & Worksheet Method Pill', () => {
  beforeEach(() => {
    localStorage.clear()
    boardCatalog.boards = []
    boardCatalog.activeBoardId = null
    while (inkyStore.canUndo) inkyStore.undo()
    while (inkyStore.canRedo) inkyStore.redo()
    inkyStore.strokes = []
    inkyStore.stamps = []
    inkyStore.stampedReveal = null
    inkyStore.setMathCapsule(null)
    inkyStore.camera = { x: 512, y: 40, z: 1 }
    inkyStore.setActiveTool('select')
  })

  afterEach(() => {
    for (const root of roots) root.unmount()
    for (const container of containers) container.remove()
    roots = []
    containers = []
    document.body.innerHTML = ''
  })

  test('MathActionCapsule uses active board worksheetMethod="completing-the-square" to show Socratic Coach Tray and stamp x^2 + 6x = 7 instead of factoring', async () => {
    const board = boardCatalog.createBoard(
      'worksheet',
      'Algebra II: Completing the Square Worksheet',
      [
        {
          pageNumber: 1,
          width: 816,
          height: 1056,
          dataUrl: 'data:image/jpeg;base64,fake',
          textContent: 'Directions: Solve each quadratic equation by completing the square.',
        },
      ],
      'blank',
    )
    expect(board.worksheetMethod).toBe('completing-the-square')

    inkyStore.setMathCapsule({
      latex: 'x^2 + 6x - 7 = 0',
      worldPosition: { x: 200, y: 200 },
      enclosedStrokeIds: [],
      source: 'ml',
      mlPending: false,
    })

    await mount(<MathActionCapsule />)

    const tray = document.querySelector('[data-testid="socratic-coach-tray"]')
    expect(tray).not.toBeNull()
    expect(tray?.textContent).toContain(
      'To complete the square, first move the constant term to the right side.',
    )
    expect(tray?.textContent).toContain('Add 7 to both sides to isolate the x terms')

    const hintBtn = button('Hint')
    expect(hintBtn).not.toBeNull()
    hintBtn?.click()
    await flush()

    expect(inkyStore.stamps).toHaveLength(1)
    expect(inkyStore.stamps[0].text).toBe('x^2 + 6x = 7')
  })

  test('WorksheetBackgroundLayer renders interactive Method Pill at top-right of Page 1 and cycles through coaching methods', async () => {
    const board = boardCatalog.createBoard(
      'worksheet',
      'Algebra II: Completing the Square Worksheet',
      [
        {
          pageNumber: 1,
          width: 816,
          height: 1056,
          dataUrl: 'data:image/jpeg;base64,fake',
          textContent: 'Directions: Solve each quadratic equation by completing the square.',
        },
      ],
      'blank',
    )
    expect(board.worksheetMethod).toBe('completing-the-square')

    await mount(<WorksheetBackgroundLayer />)

    const pill = document.querySelector(
      '[data-testid="worksheet-method-pill"]',
    ) as HTMLButtonElement | null
    expect(pill).not.toBeNull()
    expect(pill?.textContent).toContain('Completing the Square')
    expect(pill?.getAttribute('data-method')).toBe('completing-the-square')

    // Click 1: completing-the-square -> factoring
    pill?.click()
    await flush()
    expect(boardCatalog.getActiveBoard()?.worksheetMethod).toBe('factoring')
    expect(pill?.getAttribute('data-method')).toBe('factoring')

    // Click 2: factoring -> quadratic-formula
    pill?.click()
    await flush()
    expect(boardCatalog.getActiveBoard()?.worksheetMethod).toBe('quadratic-formula')

    // Click 3: quadratic-formula -> linear-balancing
    pill?.click()
    await flush()
    expect(boardCatalog.getActiveBoard()?.worksheetMethod).toBe('linear-balancing')

    // Click 4: linear-balancing -> auto
    pill?.click()
    await flush()
    expect(boardCatalog.getActiveBoard()?.worksheetMethod).toBe('auto')

    // Click 5: auto -> completing-the-square
    pill?.click()
    await flush()
    expect(boardCatalog.getActiveBoard()?.worksheetMethod).toBe('completing-the-square')
  })
})
