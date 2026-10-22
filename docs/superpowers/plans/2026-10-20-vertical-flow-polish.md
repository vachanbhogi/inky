# Vertical Flow Polish (Draw → Circle → Recognize → Act → Stamp) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the math vertical flow — draw ink, circle it, capsule recognizes, act, answer stamps, dismiss — 100% polished in functionality, UI, UX, and motion, with three signature moments: the lasso dissolving into the capsule, the ML-refinement sparkle, and the answer writing itself on.

**Architecture:** Pure-logic motion functions in a new `src/lib/canvas/motion.ts` (unit-tested, `prefers-reduced-motion` aware) drive transient animation state held in the existing `InkyStore` (`gestureDissolve`, `recognizedPulse`, `stampedReveal`, `capsule.mlPending`). `CanvasLayer.tsx` consumes that state in its existing on-demand RAF loop (extended gating); `MathActionCapsule.tsx` gains an exit animation, sparkle affordance, and action availability from a new `getAvailableActions()` in `math-solver.ts`; `InkyBoard.tsx` wires gesture handoff + dismissal. No new runtime dependencies — CSS keyframes for DOM, canvas RAF for ink.

**Tech Stack:** React 19, existing `InkyStore` (observable class), Tailwind v4 + hand-written keyframes in `index.css`, vitest (run via `bun test`), TypeScript strict (`tsc -b --force`), biome, agent-browser for E2E.

**Spec:** This document's **Flow Definition** section (no separate spec file exists; it captures the user requirement "vertical flow 100% polished — functionality, UI, UX, animations, wow factor").

## Flow Definition (the authority this plan argues from)

1. User draws strokes (draw tool), then draws a circle enclosing them.
2. On pointer-up, if the stroke is a closed loop enclosing ≥1 stroke:
   - the lasso stroke **dissolves** toward the capsule anchor (never silently vanishes),
   - the enclosed strokes get a brief **recognition pulse**,
   - the capsule opens **instantly** with rule-based latex (`source: 'rule'`, `mlPending: true`, sparkle visible),
   - the enclosed strokes are selected (existing behavior).
3. ML inference runs async in the WASM worker; on success the latex upgrades **in place** (existing blur crossfade) and the sparkle resolves; on failure/timeout the rule latex stays and the sparkle fades — **never** an error UI.
4. Capsule can be dismissed at any time by: Close button, Escape, clicking empty canvas, or erasing/deleting its strokes. Dismissal animates out (scale-down + fade).
5. Solve/Factor/Simplify render only the actions that apply to the latex; unavailable actions are visually disabled and no-op. Stamping an action writes the answer on with a left→right **handwriting wipe**, dismisses the capsule, and is a **single undo step**.
6. Every motion respects `prefers-reduced-motion`: DOM via the existing global CSS override, canvas via `matchMedia` in the motion functions (snap to end state).
7. Pan/zoom while the capsule is open keeps the capsule anchored correctly (existing).

## Global Constraints

- No new runtime dependencies (no framer-motion, no animation libs). CSS keyframes + canvas RAF only.
- All durations ≤ 450 ms; easing for entrances/exits is ease-out-quint `cubic-bezier(0.23, 1, 0.32, 1)` (matches existing `capsuleIn`); exits may use ease-in.
- Locked constants: capsule entrance 220 ms (exists), formula swap 160 ms (exists), capsule exit 140 ms, lasso dissolve 280 ms, recognized pulse 420 ms, stamp wipe 420 ms with 16 px soft edge, sparkle pulse 1400 ms loop while pending, sparkle resolve pop 200 ms.
- Capsule must open synchronously with rule latex; ML never blocks UI; failures/timeouts keep fallback silently.
- Canvas RAF loop must stop when no animation is active (battery).
- Verification gates after every task, all green: `bunx tsc -b --force` (NOT plain `tsc --noEmit` — root tsconfig is project-references), `bunx biome check src/`, `bun test`, `bun run build`.
- Tests use `vitest` imports (`describe/it/expect`) — `bun test` runs them all; source-scanning component tests follow the existing `ui-touch-targets.test.ts` convention (read TSX source, assert patterns) since jsdom/testing-library are not installed.
- WASM loading stays on the `onnxruntime-web/ort-wasm-simd-threaded.wasm?url` + `{ wasm }` wasmPaths pattern (fixed this session; `public/ort/` is deleted — do not resurrect it).
- Models live in `public/models/` (gitignored); E2E requires `bun run dev` on :5173.

## Review Focus

Failure modes the unit tests below do NOT cover directly; each line names the task that pins it.

1. **Loop gesture enclosing zero strokes** — circle must remain a normal stroke; no dissolve, no capsule. Pinned in Task 1 (store wiring source-scan: dissolve set only inside the `enclosedIds.length > 0` branch).
2. **Canvas RAF loop leak** — continuous animation must stop when dissolve/pulse/wipe complete. Pinned in Tasks 1 & 3 (source-scan: gating includes animation state; progress fns return `done` at boundary).
3. **Reduced motion on canvas** — CSS override cannot reach JS canvas animation; strokes must snap to final state. Pinned in Tasks 1 & 3 (`prefersReducedMotion` stubbed in `matchMedia`, progress fns return end state).
4. **ML resolves after capsule dismissed or strokes erased** — no ghost capsule, no latex resurrection. Pinned in Task 2 (validate fn unit test) and Task 6 (E2E: close fast, wait, assert no capsule).
5. **Undo after Solve** — one Cmd+Z must restore pre-stamp strokes AND clear the stamped selection. Pinned in Task 3 (store test: `stampResult` pushes exactly one undo entry).
6. **Stale capsule after erasing enclosed strokes** — capsule dismisses, actions can't target missing strokes. Pinned in Task 2 (`validateCapsuleIntegrity` unit test + erase path source-scan).

---

### Task 1: Lasso Dissolve + Recognition Pulse (gesture handoff)

**Files:**
- Create: `src/lib/canvas/motion.ts`
- Create: `src/lib/canvas/motion.test.ts`
- Modify: `src/lib/canvas/store.ts` (add `gestureDissolve`, `recognizedPulse` fields + setters)
- Modify: `src/components/canvas/CanvasLayer.tsx` (render dissolve + pulse; extend RAF gating)
- Modify: `src/components/canvas/InkyBoard.tsx` (loop-detection block ~lines 474–512: set dissolve/pulse instead of discarding the lasso)
- Test: `src/components/canvas/canvas-animation-gates.test.ts`

**Interfaces:**
- Consumes: `isClosedLoop()` / `findEnclosedStrokes()` (existing), `Stroke` type, `inkyStore.subscribe`.
- Produces (Task 3 reuses `prefersReducedMotion` and `easeOutQuint`; CanvasLayer pattern reused):
  - `motion.ts`: `export function prefersReducedMotion(): boolean`; `export function easeOutQuint(t: number): number` (t clamped 0–1); `export interface DissolveResult { opacity: number; scale: number; done: boolean }`; `export function lassoDissolve(elapsedMs: number, anchor: { x: number; y: number }, stroke: Stroke): DissolveResult` — 280 ms; opacity 1→0, uniform scale 1→0.92 about `anchor`; reduced motion → `{ opacity: 0, scale: 0.92, done: true }`; done at ≥280 ms.
  - `motion.ts`: `export function recognizedPulseAlpha(elapsedMs: number): { alpha: number; done: boolean }` — 420 ms, alpha 0.16→0, ease-out; reduced motion → `{ alpha: 0, done: true }`.
  - `store.ts`: fields `gestureDissolve: { stroke: Stroke; anchor: { x: number; y: number }; startedAt: number } | null`, `recognizedPulse: { strokeIds: string[]; startedAt: number } | null`; methods `setGestureDissolve(v: typeof this.gestureDissolve)`, `setRecognizedPulse(v: typeof this.recognizedPulse)`, `clearTransientAnimations()` (nulls both + notify).

- [ ] **Step 1: Write failing tests** in `motion.test.ts`:
  - `lassoDissolve(0, anchor, stroke)` → `{ opacity: 1, scale: 1, done: false }`
  - `lassoDissolve(280, …)` and `(1000, …)` → `{ opacity: 0, done: true }`
  - monotonic: `lassoDissolve(140, …).opacity` strictly between 0 and 1
  - reduced motion: stub `globalThis.matchMedia` to `{ matches: true }` → immediate `{ opacity: 0, done: true }`
  - `recognizedPulseAlpha(0).alpha` ≈ 0.16; `(420)` → `{ alpha: 0, done: true }`; reduced → immediate done
  - `easeOutQuint(0) === 0`, `easeOutQuint(1) === 1`, `easeOutQuint(0.5)` > 0.5
- [ ] **Step 2: Run** `bun test src/lib/canvas/motion.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement `motion.ts`** per Produces block.
- [ ] **Step 4: Run** the test file — Expected: all PASS.
- [ ] **Step 5: Add store fields/setters** (`store.ts`) and write the gate test in `canvas-animation-gates.test.ts`:
  - `InkyBoard.tsx` source matches `/setGestureDissolve\(/` AND the call sits inside the `enclosedIds.length > 0` branch (assert source contains the guarded sequence `if (enclosedIds.length > 0)` before `setGestureDissolve` within 40 lines).
  - `InkyBoard.tsx` source contains `setRecognizedPulse(` with `enclosedStrokeIds`/`enclosedIds`.
  - `CanvasLayer.tsx` source: `needsContinuousAnimation` includes `gestureDissolve` and `recognizedPulse`.
  - `CanvasLayer.tsx` source renders dissolve (calls `lassoDissolve`) and pulse (calls `recognizedPulseAlpha`) — pulse drawn as translucent rounded-rect highlight behind each enclosed stroke's bounding box, dissolve draws the lasso `pathData` with computed opacity/scale about the anchor.
- [ ] **Step 6: Run** `bun test src/components/canvas/canvas-animation-gates.test.ts` — Expected: FAIL (patterns absent).
- [ ] **Step 7: Implement** store fields + CanvasLayer rendering + InkyBoard wiring:
  - In InkyBoard loop branch, replace the implicit lasso discard: `inkyStore.setGestureDissolve({ stroke: finalStroke, anchor: { x: centerX, y: minY }, startedAt: performance.now() })`; add `inkyStore.setRecognizedPulse({ strokeIds: enclosedIds, startedAt: performance.now() })`.
  - CanvasLayer: when `gestureDissolve` active, compute `lassoDissolve(performance.now() - startedAt, …)`; skip draw when `done` (and call `clearTransientAnimations()` for the dissolve half); render lasso fill with `globalAlpha = opacity`, `ctx.translate(anchor) … scale … translate(-anchor)` about anchor, scaled by computed `scale`. Pulse: for each enclosed stroke id, fill rounded rect of bbox + 3px pad with `rgba(37, 99, 235, alpha)` before the stroke draws.
  - Extend the RAF gating condition with `inkyStore.gestureDissolve !== null || inkyStore.recognizedPulse !== null`.
- [ ] **Step 8: Run gates** — `bun test`, `bunx tsc -b --force`, `bunx biome check src/` — Expected: all green; full motion tests PASS.
- [ ] **Step 9: Commit** `git add -A src/lib/canvas src/components/canvas && git commit -m "feat(canvas): lasso dissolve + recognition pulse on circle gesture"`

### Task 2: Capsule Lifecycle — dismissal everywhere + exit animation + stale guard

**Files:**
- Create: `src/lib/canvas/capsule-integrity.ts` + `capsule-integrity.test.ts`
- Modify: `src/components/canvas/MathActionCapsule.tsx` (exit animation; integrity subscribe)
- Modify: `src/components/canvas/InkyBoard.tsx` (Escape handler ~line 110; `handlePointerDown` ~line 178)
- Modify: `src/index.css` (`.inky-capsule-out` keyframes)
- Test: `src/components/canvas/capsule-lifecycle.test.ts`

**Interfaces:**
- Consumes: `inkyStore.mathCapsule` shape (`latex`, `worldPosition`, `enclosedStrokeIds`, `source`), existing `capsuleIn` CSS pattern.
- Produces:
  - `capsule-integrity.ts`: `export function validateCapsuleIntegrity(capsule: { enclosedStrokeIds: string[] } | null, strokes: { id: string }[]): boolean` — true iff capsule is null OR every enclosed id still exists in strokes.
  - `index.css`: `.inky-capsule-out { animation: capsuleOut 140ms ease-in forwards; }` + `@keyframes capsuleOut { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.96); } }` (global reduced-motion override already neutralizes it).
  - `MathActionCapsule.tsx`: holds `exiting: boolean`; when store capsule transitions to null while previously open, sets `exiting` and renders the last capsule with `.inky-capsule-out`, clearing after 140 ms (`setTimeout`); `data-capsule-state="open|exiting"` attribute on the pill root for tests/E2E.

- [ ] **Step 1: Write failing unit tests** (`capsule-integrity.test.ts`): null capsule → true; capsule with ids `['a','b']` and strokes `[{id:'a'},{id:'b'}]` → true; missing `'b'` → false; empty ids → true.
- [ ] **Step 2: Run** — Expected: FAIL (module not found).
- **Step 3: Implement `validateCapsuleIntegrity`** (3-line function).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Write failing gate tests** (`capsule-lifecycle.test.ts`):
  - `InkyBoard.tsx` Escape handler: source matches `/e\.key === 'Escape'[\s\S]{0,200}mathCapsule/` (Escape dismisses capsule before `clearSelection`).
  - `InkyBoard.tsx` `handlePointerDown`: source contains `setMathCapsule(null)` guarded by `inkyStore.mathCapsule` (click empty canvas dismisses); the existing `closest('.inky-ui')` early-return precedes it (clicks on the capsule itself never reach the board — capsule root already stops propagation).
  - `MathActionCapsule.tsx` renders `inky-capsule-out` when exiting and sets `data-capsule-state`.
  - `MathActionCapsule.tsx` subscribe path calls `validateCapsuleIntegrity` (stale-guard single choke point).
- [ ] **Step 6: Run** — Expected: FAIL.
- [ ] **Step 7: Implement:**
  - `index.css` keyframes + `.inky-capsule-out`.
  - `MathActionCapsule.tsx`: `const lastCapsuleRef = useRef(capsule)`; in subscriber, if `!validateCapsuleIntegrity(next, inkyStore.strokes)` → `inkyStore.setMathCapsule(null)`. Exit: `useEffect` on `capsule === null && lastCapsuleRef.current` → `setExiting(true)`, render pill from `lastCapsuleRef.current` with `.inky-capsule-out`, `setTimeout(() => { setExiting(false); lastCapsuleRef.current = null }, 140)`.
  - `InkyBoard.tsx`: in Escape branch, `if (inkyStore.mathCapsule) { inkyStore.setMathCapsule(null); return }` before `clearSelection()`; in `handlePointerDown` after the `.inky-ui` guard, `if (inkyStore.mathCapsule) inkyStore.setMathCapsule(null)`.
- [ ] **Step 8: Run gates** (`bun test`, `tsc -b --force`, `biome`) — Expected: green.
- [ ] **Step 9: Commit** `git commit -m "feat(capsule): dismiss on Escape/click-away/stroke-loss, animated exit"`

### Task 3: Stamp Write-On + Single-Undo Solve

**Files:**
- Modify: `src/lib/canvas/motion.ts` (+ `stampReveal`), `src/lib/canvas/motion.test.ts`
- Modify: `src/lib/canvas/store.ts` (`stampedReveal` field, `stampResult(strokes: Stroke[])`)
- Create: `src/lib/canvas/store-stamp.test.ts`
- Modify: `src/components/canvas/CanvasLayer.tsx` (wipe rendering + gating)
- Modify: `src/components/canvas/MathActionCapsule.tsx` (`handleAction` uses `stampResult`)
- Modify: `src/main.tsx` or `src/lib/canvas/store.ts` (dev-only `window.inkyStore` hook for E2E)
- Test: `src/components/canvas/stamp-gates.test.ts`

**Interfaces:**
- Consumes: `prefersReducedMotion`, `easeOutQuint` (Task 1), `synthesizeHandwrittenStrokes` (existing), store undo stack (`undoStack` private; `addStroke` pushes).
- Produces:
  - `motion.ts`: `export interface WipeResult { clipX: number; done: boolean }`; `export function stampWipe(elapsedMs: number, bbox: { minX: number; maxX: number }): WipeResult` — 420 ms, `clipX` advances from `minX - 16` to `maxX + 16` with ease-out-quint; reduced motion → `{ clipX: maxX + 16, done: true }`.
  - `store.ts`: `stampedReveal: { strokeIds: string[]; startedAt: number } | null`; `stampResult(strokes: Stroke[])`: pushes current strokes onto undo stack ONCE, appends batch, sets `stampedReveal`, selects the new stroke ids, clears `mathCapsule`, notifies.

- [ ] **Step 1: Failing tests** (`motion.test.ts` additions): `stampWipe(0, bbox).clipX` = `minX - 16`; `(420)`/`(9999)` → `{ clipX: maxX + 16, done: true }`; midpoint strictly inside; reduced motion → immediate done.
- [ ] **Step 2: Run** — Expected: FAIL on new cases.
- [ ] **Step 3: Implement `stampWipe`.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Failing store tests** (`store-stamp.test.ts`): `stampResult` with 5 strokes → undo stack has exactly 1 entry; `inkyStore.strokes` grows by 5; `mathCapsule` null; `selectedStrokeIds` = stamped ids; `stampedReveal.strokeIds` = stamped ids; one `undo()` restores pre-stamp strokes and clears selection.
- [ ] **Step 6: Run** — Expected: FAIL.
- [ ] **Step 7: Implement store `stampResult` + `stampedReveal`.**
- [ ] **Step 8: Run** — PASS.
- [ ] **Step 9: Failing gate tests** (`stamp-gates.test.ts`): `CanvasLayer.tsx` uses `stampWipe` and clips stamped strokes (`clip(`); `needsContinuousAnimation` includes `stampedReveal`; `MathActionCapsule.tsx` `handleAction` calls `stampResult(` and no longer loops `addStroke(`; dev E2E hook: `window.inkyStore` assignment guarded by `import.meta.env.DEV`.
- [ ] **Step 10: Run** — Expected: FAIL.
- [ ] **Step 11: Implement:** CanvasLayer — when `stampedReveal` active, `ctx.save(); ctx.beginPath(); ctx.rect(wipe.clipX - 16 … viewport bottom …); ctx.clip()` around the stamped-strokes draw pass, then restore; skip draw of not-yet-revealed strokes; gating includes `stampedReveal`. MathActionCapsule — replace the `addStroke` loop + manual select/dismiss with `inkyStore.stampResult(newStrokes)`. Store/module — `if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).inkyStore = inkyStore` at module bottom of `store.ts`.
- [ ] **Step 12: Run gates** — Expected: all green.
- [ ] **Step 13: Commit** `git commit -m "feat(capsule): handwriting wipe on stamp + single-undo solve"`

### Task 4: ML-Refinement Sparkle (pending affordance)

**Files:**
- Modify: `src/lib/canvas/store.ts` (capsule type gains `mlPending?: boolean`)
- Modify: `src/components/canvas/InkyBoard.tsx` (set/clear `mlPending` around `recognizeInkML`)
- Modify: `src/components/canvas/MathActionCapsule.tsx` (sparkle element + resolve pop)
- Modify: `src/index.css` (`.inky-capsule-sparkle` pulse keyframes)
- Test: `src/components/canvas/capsule-sparkle.test.ts`

**Interfaces:**
- Consumes: capsule shape (Task 2/3), existing `capsuleSwap` crossfade.
- Produces: CSS `.inky-capsule-sparkle` (6px dot before the formula; `sparklePulse` 1400 ms ease-in-out infinite alternate opacity/scale while pending; `.inky-capsule-sparkle-resolve` one-shot 200 ms scale pop). Capsule renders sparkle only when `capsule.mlPending`; on ML settle the flag clears and resolve class applies for 200 ms.

- [ ] **Step 1: Failing gate tests** (`capsule-sparkle.test.ts`): `InkyBoard.tsx` sets `mlPending: true` in the rule capsule and `mlPending: false` in both the upgrade path AND the failure path (`if (!mlLatex) return` branch must clear pending — assert source shows `mlPending: false` before/at both settle paths); `MathActionCapsule.tsx` renders `inky-capsule-sparkle` when `mlPending`; `index.css` contains `sparklePulse` keyframes and the reduced-motion override already covers `.inky-ui *`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement:** store type `mlPending?: boolean`; InkyBoard — rule capsule opens with `mlPending: true`; the `recognizeInkML.then` callback ALWAYS clears it: on `null` → `setMathCapsule({ ...capsule, mlPending: false })` (guard: capsule still open for same strokes, existing `sameSet` check), on success → existing upgrade plus `mlPending: false`. Capsule — sparkle dot `<span className="inky-capsule-sparkle …" aria-hidden>` between formula and divider; resolve-pop via local state set for 200 ms when `mlPending` transitions true→false. CSS — keyframes.
- [ ] **Step 4: Run gates** — Expected: green.
- [ ] **Step 5: Commit** `git commit -m "feat(capsule): ML-refinement sparkle while inference is pending"`

### Task 5: Action Availability (no mislabeled/duplicate stamps)

**Files:**
- Modify: `src/lib/math/math-solver.ts` (+ `getAvailableActions`), `src/lib/math/math-solver.test.ts`
- Modify: `src/components/canvas/MathActionCapsule.tsx` (render disabled state)
- Test: `src/components/canvas/capsule-actions.test.ts`

**Interfaces:**
- Consumes: existing `solveMath`.
- Produces: `export type MathAction = 'solve' | 'factor' | 'simplify'`; `export function getAvailableActions(latex: string): MathAction[]` — `solve` iff cleaned latex contains `=`; `factor` iff cleaned latex contains `^2`; `simplify` iff cleaned latex contains NO `=`. Order: `['solve','factor','simplify']` filtered by those rules (spec cases in Step 1 pin every combination).

- [ ] **Step 1: Failing tests** (`math-solver.test.ts` additions):
  - `getAvailableActions('2x+1=7')` → `['solve']`
  - `getAvailableActions('x^2-5x+6=0')` → `['solve','factor']`
  - `getAvailableActions('3(2+4)')` → `['simplify']`
  - `getAvailableActions('x^2+2x+1')` → `['simplify','factor']`
  - `getAvailableActions('')` → `[]`
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** `getAvailableActions` in `math-solver.ts` (clean `$`, split logic on the same patterns `solveMath` uses).
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Gate test** (`capsule-actions.test.ts`): `MathActionCapsule.tsx` renders buttons from `getAvailableActions` output; unavailable actions get `aria-disabled="true"` + reduced-opacity class; the three-button source no longer hardcodes all three unconditionally (assert a `.map(` or filter over an actions list).
- [ ] **Step 6: Implement** in `MathActionCapsule.tsx`: `const actions = getAvailableActions(capsule.latex)` memoized; render each of the three known buttons, applying `aria-disabled` + `opacity-40` + no-op `onClick` when absent from `actions`; keep Solve visually primary when available.
- [ ] **Step 7: Run gates** — Expected: green.
- [ ] **Step 8: Commit** `git commit -m "feat(capsule): action availability gating for solve/factor/simplify"`

### Task 6: E2E Vertical-Flow Verification (agent-browser)

**Files:**
- Create: `scripts/e2e-vertical-flow.sh` (executable bash; agent-browser driven)
- Artifacts: `e2e-runs/<timestamp>/` screenshots (gitignored — add `e2e-runs/` to `.gitignore`)

**Interfaces:**
- Consumes: dev server (`bun run dev`, :5173), dev-only `window.inkyStore` (Task 3), `data-capsule-state` (Task 2), sparkle class (Task 4).
- Produces: one script, re-runnable, exit code 0 only if every assertion passes; screenshots at each stage.

- [ ] **Step 1: Write `scripts/e2e-vertical-flow.sh`** implementing, in order (drawing via `agent-browser mouse down/move --steps N/up`; equation `2x+1=7` as ~9 strokes around x 350–760 / y 280–400 in a 1280×800 viewport, then a lasso ellipse centered ~(560,340) rx≈290 ry≈130 with ~40° overshoot that **crosses** its own start at an angle — collinear overlap is NOT an intersection per `loop-detection.ts` — plus an inward cut past the start):
  1. Open :5173 fresh; `agent-browser errors` and `agent-browser network requests --clear`.
  2. Draw equation strokes; assert via `eval "window.inkyStore.strokes.length"` equals expected count.
  3. Draw lasso; within 1 s assert capsule present: `eval "window.inkyStore.mathCapsule !== null"`, `source === 'rule'`, `mlPending === true`; screenshot `01-capsule-rule.png`.
  4. Poll ≤15 s for `source === 'ml'`; record both latex values; screenshot `02-capsule-ml.png`.
  5. Assert no page errors and no network request matching `/ort/` (the regression that started this work); assert `/models/encoder.ort` returned 200.
  6. Click Solve; assert `inkyStore.mathCapsule === null`, stamped stroke count increased, `stampedReveal` was set (or screenshot `03-stamp.png` showing the answer right of the equation).
  7. `press Meta+z` once; assert stroke count restored to pre-stamp count.
  8. Re-circle (redraw lasso around equation) → capsule opens; press Escape → assert capsule null; screenshot `04-after-escape.png`.
  9. Re-circle → click empty canvas point → capsule null.
  10. Re-circle → close fast (before ML settles) → wait 12 s → assert capsule still null (Review Focus #4).
  11. Reduced-motion pass: `agent-browser set media light reduced-motion`, reload, draw+circle, assert capsule visible with rule latex (screenshot `05-reduced-motion.png`).
- [ ] **Step 2: Run the script** with dev server up: `bash scripts/e2e-vertical-flow.sh` — Expected: every assertion passes, exit 0.
- [ ] **Step 3: Fix any failures** (use `systematic-debugging`; screenshots + `agent-browser console`).
- [ ] **Step 4: Re-run gates**: `bun test`, `bunx tsc -b --force`, `bunx biome check src/`, `bun run build` — Expected: all green.
- [ ] **Step 5: Commit** `git add scripts .gitignore && git commit -m "test(e2e): vertical flow verification script (agent-browser)"`

---

## Self-Review Notes

- Coverage: gesture handoff (T1), dismissal/integrity (T2), stamping/undo (T3), ML pending affordance (T4), action correctness (T5), end-to-end proof (T6). Review Focus items each map to a pinning task.
- Type consistency: `MathAction` exported from math-solver and used by capsule; `stampedReveal`/`gestureDissolve`/`recognizedPulse` names identical across store/motion/CanvasLayer; `mlPending` optional so existing tests constructing capsule literals stay valid.
- Proportion: pure-logic bodies are algorithmically pinned by tests; JSX bodies are pinned by gate tests naming exact classes/attrs.
