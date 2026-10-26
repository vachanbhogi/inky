import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createRoot, type Root } from 'react-dom/client'
import { inkyStore } from '../../lib/canvas/store'
import { boardCatalog } from '../../lib/document/boardCatalog'
import { MathActionCapsule } from './MathActionCapsule'
import { SocraticMarginCoach } from './SocraticMarginCoach'

let roots: Root[] = []
let containers: HTMLDivElement[] = []

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

async function mountCoach(withCapsule = false) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  roots.push(root)
  containers.push(el)
  root.render(
    <>
      <SocraticMarginCoach />
      {withCapsule && <MathActionCapsule />}
    </>,
  )
  await flush()
}

function setCapsule(latex: string, mlPending = false) {
  inkyStore.setMathCapsule({
    latex,
    worldPosition: { x: 200, y: 200 },
    enclosedStrokeIds: [],
    source: 'ml',
    mlPending,
  })
}

describe('SocraticMarginCoach', () => {
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
    inkyStore.camera = { x: 400, y: 80, z: 1 }
    inkyStore.setActiveTool('select')
  })

  afterEach(() => {
    for (const root of roots) root.unmount()
    for (const container of containers) container.remove()
    roots = []
    containers = []
    document.body.innerHTML = ''
  })

  test('does not render when capsule is null or mlPending is true', async () => {
    await mountCoach()
    expect(document.querySelector('[aria-label="Socratic Margin Coach"]')).toBeNull()

    setCapsule('x^2 + 6x - 7 = 0', true)
    await flush()
    expect(document.querySelector('[aria-label="Socratic Margin Coach"]')).toBeNull()
  })

  test('renders Socratic question, operation explanation, and method badge for an active equation', async () => {
    const board = boardCatalog.createBoard('worksheet', 'Unit 5 CTS', [
      {
        pageNumber: 1,
        width: 816,
        height: 1056,
        dataUrl: 'data:image/jpeg;base64,fake',
        textContent: 'Solve each equation by completing the square. 1) x^2 + 6x - 7 = 0',
      },
    ])
    expect(board.worksheetMethod).toBe('completing-the-square')

    setCapsule('x^2 + 6x - 7 = 0', false)
    await mountCoach()

    const card = document.querySelector('[aria-label="Socratic Margin Coach"]')
    expect(card).not.toBeNull()
    expect(card?.textContent).toContain('Completing the Square')
    expect(card?.textContent).toContain('To complete the square, first move the constant term')
    expect(card?.textContent).toContain('Add 7 to both sides')
  })

  test('cycles coaching methods and updates coaching step from Completing the Square to Factoring', async () => {
    boardCatalog.createBoard('worksheet', 'Unit 5 CTS', [
      {
        pageNumber: 1,
        width: 816,
        height: 1056,
        dataUrl: 'data:image/jpeg;base64,fake',
        textContent: 'Solve each equation by completing the square. 1) x^2 + 6x - 7 = 0',
      },
    ])

    setCapsule('x^2 + 6x - 7 = 0', false)
    await mountCoach()

    const cycleBtn = document.querySelector(
      'button[title="Cycle coaching method"]',
    ) as HTMLButtonElement | null
    expect(cycleBtn).not.toBeNull()
    expect(cycleBtn?.textContent).toContain('Completing the Square')

    // Click to cycle to Factoring
    cycleBtn?.click()
    await flush()

    expect(boardCatalog.getActiveBoard()?.worksheetMethod).toBe('factoring')
    expect(cycleBtn?.textContent).toContain('Factoring')
    const card = document.querySelector('[aria-label="Socratic Margin Coach"]')
    expect(card?.textContent).toContain('Factor the quadratic expression')
  })

  test('stamps expectedNextForm in Caveat handwriting below the student work when clicking Stamp Guided Step', async () => {
    boardCatalog.createBoard('worksheet', 'Unit 5 CTS', [
      {
        pageNumber: 1,
        width: 816,
        height: 1056,
        dataUrl: 'data:image/jpeg;base64,fake',
        textContent: 'Solve each equation by completing the square. 1) x^2 + 6x - 7 = 0',
      },
    ])

    setCapsule('x^2 + 6x - 7 = 0', false)
    await mountCoach()

    const stampBtn = document.querySelector(
      'button[aria-label="Stamp Guided Step"]',
    ) as HTMLButtonElement | null
    expect(stampBtn).not.toBeNull()

    stampBtn?.click()
    await flush()

    expect(inkyStore.stamps).toHaveLength(1)
    expect(inkyStore.stamps[0].text).toBe('x^2 + 6x = 7')
    expect(inkyStore.stamps[0].color).toBe('#2563eb')
    expect(inkyStore.mathCapsule).toBeNull()
    expect(inkyStore.activeTool).toBe('draw')
  })

  test('MathActionCapsule Hint button also respects worksheetMethod from boardCatalog', async () => {
    boardCatalog.createBoard('worksheet', 'Unit 5 CTS', [
      {
        pageNumber: 1,
        width: 816,
        height: 1056,
        dataUrl: 'data:image/jpeg;base64,fake',
        textContent: 'Solve each equation by completing the square.',
      },
    ])

    setCapsule('x^2 + 6x - 7 = 0', false)
    await mountCoach(true)

    const hintBtn = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Hint')
    expect(hintBtn).toBeDefined()
    hintBtn?.click()
    await flush()

    expect(inkyStore.stamps).toHaveLength(1)
    expect(inkyStore.stamps[0].text).toBe('x^2 + 6x = 7')
  })

  test('displays multi-line step check diagnostic when student circles 2+ lines of work', async () => {
    boardCatalog.createBoard('worksheet', 'Homework')
    setCapsule('x^2 + 6x = 7\n(x + 3)^2 = 7', false)
    await mountCoach()

    const card = document.querySelector('[aria-label="Socratic Margin Coach"]')
    expect(card).not.toBeNull()
    expect(card?.textContent).toContain('Line 2:')
    expect(card?.textContent).toContain('Remember to add 9 to the right side')
  })
})
