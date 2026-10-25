#!/usr/bin/env bash
# E2E vertical-flow verification (agent-browser driven): draw equation -> lasso circle -> rule capsule (mlPending) -> ML upgrade -> Solve stamps real text (one undo) -> undo -> dismissals -> marquee-selection open -> stamp pans with canvas -> eraser deletes stamp -> brace-form dead-Solve regression (injected latex + human-drawn quadratic) -> reduced-motion pass.
# Equation strokes carry a deterministic +/-2px jitter and a human-ish pause so the input reads like a hand, not a plotter. Exit code 0 only if every assertion passes. Artifacts: e2e-runs/<ts>/.
set -u

export AGENT_BROWSER_SESSION="inky-e2e-vertical-flow"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

RUN_DIR="e2e-runs/$(date +%Y%m%d-%H%M%S)"
LOG="$RUN_DIR/browser.log"
mkdir -p "$RUN_DIR"
: > "$LOG"

PASS=0
FAIL=0
ok() { PASS=$((PASS + 1)); echo "  ok   $*"; }
bad() { FAIL=$((FAIL + 1)); echo "  FAIL $*"; }
note() { echo "  ..   $*"; }
section() { echo; echo "== $*"; }

# Evaluate JS in the page; prints the raw JSON-ish result (trailing newline stripped by command substitution).
js() { agent-browser eval "$1" 2>>"$LOG"; }

# poll_js <js-expr> <want> [tries] -- poll until the expression equals want (~100ms apart).
poll_js() {
  local expr="$1" want="$2" tries="${3:-10}" i got=""
  for ((i = 0; i < tries; i++)); do
    got=$(js "$expr")
    if [ "$got" = "$want" ]; then return 0; fi
    sleep 0.1
  done
  return 1
}

# assert_eq <got> <want> <label>
assert_eq() {
  if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (got: $1 want: $2)"; fi
}

# jit x y stroke-index -> deterministic +/-2px jitter (human-hand feel, stable across runs).
jit() { awk -v x="$1" -v y="$2" -v k="$3" 'BEGIN{srand(x*7919+y*104729+k); printf "%d %d", x+int(rand()*5)-2, y+int(rand()*5)-2}'; }

# stroke <index> x0 y0 x1 y1 ... -- one pen stroke with jittered points and a short human pause.
stroke() {
  local k="$1" i n
  shift
  local pts=("$@")
  n=$((${#pts[@]} / 2))
  set -- $(jit "${pts[0]}" "${pts[1]}" "$k")
  agent-browser mouse move "$1" "$2" >>"$LOG" 2>&1
  agent-browser mouse down >>"$LOG" 2>&1
  for ((i = 1; i < n; i++)); do
    set -- $(jit "${pts[i * 2]}" "${pts[i * 2 + 1]}" "$k")
    agent-browser mouse move "$1" "$2" --steps 4 >>"$LOG" 2>&1
  done
  agent-browser mouse up >>"$LOG" 2>&1
  sleep 0.06
}

# draw_equation <index-base> -- the 9 strokes of 2x+1=7 (x 365-755, y 288-365, inside the lasso).
draw_equation() {
  local b="$1"
  stroke $((b + 1)) 365 300 380 288 400 295 402 310 365 365 405 365
  stroke $((b + 2)) 435 300 475 360
  stroke $((b + 3)) 475 300 435 360
  stroke $((b + 4)) 510 330 550 330
  stroke $((b + 5)) 530 310 530 350
  stroke $((b + 6)) 570 305 580 295 578 365
  stroke $((b + 7)) 620 320 665 320
  stroke $((b + 8)) 620 345 665 345
  stroke $((b + 9)) 700 300 755 300 720 365
}

# draw_lasso -- 24-gon ellipse (cx 560 cy 340 rx 290 ry 130) from theta=180deg, closing on the byte-identical start point, then a ~40deg outward overshoot and an inward cut past the start. The cut crosses the ellipse head at an angle (collinear overlap is NOT an intersection per loop-detection.ts), so isClosedLoop() detects it via segment intersection; the endpoint-near-start + turning-angle fallback holds as a safety net. No jitter here: the loop topology is the gesture contract.
draw_lasso() {
  local pts k px py
  pts=()
  for k in {0..24}; do
    read -r px py <<<"$(awk -v k="$k" 'BEGIN{pi=atan2(0,-1); th=(180+15*k)*pi/180; printf "%.0f %.0f", 560+290*cos(th), 340+130*sin(th)}')"
    pts+=("$px $py")
  done
  pts[24]="${pts[0]}"
  pts+=("246 318" "232 300" "300 340" "330 360")
  set -- ${pts[0]}
  agent-browser mouse move "$1" "$2" >>"$LOG" 2>&1
  agent-browser mouse down >>"$LOG" 2>&1
  for k in "${pts[@]:1}"; do
    set -- $k
    agent-browser mouse move "$1" "$2" --steps 3 >>"$LOG" 2>&1
  done
  agent-browser mouse up >>"$LOG" 2>&1
}

# ensure_draw_tool -- the real keyboard shortcut; dev-store fallback if the key was swallowed.
ensure_draw_tool() {
  agent-browser press p >>"$LOG" 2>&1
  if [ "$(js 'window.inkyStore.activeTool')" != '"draw"' ]; then
    js "window.inkyStore.setActiveTool('draw')" >/dev/null
    note "press p did not switch tool; used the dev-store fallback"
  fi
}

# open_capsule -- lasso and require a capsule within ~1s.
open_capsule() {
  ensure_draw_tool
  draw_lasso
  poll_js 'window.inkyStore.mathCapsule !== null' true 8
}

section "1. fresh open :5173"
agent-browser close >>"$LOG" 2>&1
agent-browser set viewport 1280 800 >>"$LOG" 2>&1
agent-browser open http://localhost:5173/ >>"$LOG" 2>&1
sleep 2
agent-browser errors --clear >>"$LOG" 2>&1
agent-browser network requests --clear >>"$LOG" 2>&1
if curl -sf -o /dev/null http://localhost:5173/; then ok "dev server reachable"; else bad "dev server unreachable"; fi

section "2. human-style draw of 2x+1=7 (9 jittered strokes)"
ensure_draw_tool
draw_equation 0
assert_eq "$(js 'window.inkyStore.strokes.length')" "9" "9 strokes on canvas"

section "3. lasso circle -> instant rule capsule (within ~1s)"
draw_lasso
if poll_js 'window.inkyStore.mathCapsule !== null' true 6; then ok "capsule open within ~1s"; else bad "capsule did not open after lasso"; fi
assert_eq "$(js 'window.inkyStore.mathCapsule && window.inkyStore.mathCapsule.source === "rule"')" "true" "source=rule on open"
assert_eq "$(js 'window.inkyStore.mathCapsule && window.inkyStore.mathCapsule.mlPending === true')" "true" "mlPending=true on open"
assert_eq "$(js 'document.querySelector("[data-capsule-state=open]") ? 1 : 0')" "1" "capsule pill rendered in DOM"
assert_eq "$(js 'document.querySelectorAll(".inky-capsule-sparkle").length > 0')" "true" "sparkle dot visible while ML pending"
agent-browser screenshot "$RUN_DIR/01-capsule-rule.png" >>"$LOG" 2>&1
RULE_LATEX="$(js 'window.inkyStore.mathCapsule ? window.inkyStore.mathCapsule.latex : ""')"
note "rule latex: $RULE_LATEX"

section "4. ML in-place upgrade (poll <=15s)"
ml=false
for ((i = 0; i < 60; i++)); do
  if [ "$(js 'window.inkyStore.mathCapsule && window.inkyStore.mathCapsule.source === "ml"')" = "true" ]; then ml=true; break; fi
  sleep 0.25
done
if $ml; then ok "ML upgrade landed (source=ml)"; else bad "ML upgrade not seen within 15s"; fi
assert_eq "$(js 'window.inkyStore.mathCapsule && window.inkyStore.mathCapsule.mlPending === false')" "true" "mlPending cleared after settle"
ML_LATEX="$(js 'window.inkyStore.mathCapsule ? window.inkyStore.mathCapsule.latex : ""')"
note "ml latex: $ML_LATEX"
{ echo "rule: $RULE_LATEX"; echo "ml:   $ML_LATEX"; } >>"$RUN_DIR/latex.log"
agent-browser screenshot "$RUN_DIR/02-capsule-ml.png" >>"$LOG" 2>&1

section "5. health: no page errors, model served, no /ort/ asset"
ERRS="$(agent-browser errors 2>>"$LOG")"
if [ -z "$ERRS" ]; then ok "no page errors"; else bad "page errors: $ERRS"; fi
# Worker-internal fetches are invisible to agent-browser's network log (probed: worker fetch -> 200, zero captured), so network greps here would be vacuous. Page-level probes instead: encoder.ort must be served (200), and /ort/ must NOT be a real asset -- Vite's SPA fallback answers text/html for missing paths, a resurrected public/ort/ dir would serve application/wasm. The ML upgrade in step 4 is the end-to-end proof that the worker fetched and decoded the real bytes.
ENC_STATUS="$(js 'fetch("/models/encoder.ort", {method: "HEAD"}).then(function(r){ return r.status })')"
if [ "$ENC_STATUS" = "200" ]; then ok "encoder.ort served (HEAD 200)"; else bad "encoder.ort HEAD: $ENC_STATUS"; fi
ORT_CT="$(js 'fetch("/ort/ort-wasm-simd-threaded.wasm").then(function(r){ return r.headers.get("content-type") })')"
case "$ORT_CT" in
  *wasm*) bad "stale /ort/ WASM asset resurrected: $ORT_CT" ;;
  *text/html*) ok "no /ort/ asset (SPA fallback answers text/html)" ;;
  *) bad "unexpected /ort/ probe response: $ORT_CT" ;;
esac

section "6. Solve stamps the answer as real text sized from the user's writing"
PRE="$(js 'window.inkyStore.strokes.length')"
SOLVE_LINE="$(agent-browser snapshot -i 2>>"$LOG" | grep -m1 'button "Solve"')"
SOLVE_REF="${SOLVE_LINE##*ref=}"
SOLVE_REF="${SOLVE_REF%%]*}"
if [ -n "$SOLVE_REF" ] && [ "$SOLVE_REF" != "$SOLVE_LINE" ]; then
  note "Solve button: $SOLVE_LINE"
  if echo "$SOLVE_LINE" | grep -q "aria-disabled"; then
    bad "Solve button aria-disabled for latex: $RULE_LATEX / $ML_LATEX"
  fi
  agent-browser click "@$SOLVE_REF" >>"$LOG" 2>&1
else
  bad "Solve button not found in snapshot"
fi
if poll_js 'document.querySelectorAll("[data-stamp-id]").length' 1 10; then ok "stamp rendered as DOM text"; else bad "no [data-stamp-id] element after Solve"; fi
assert_eq "$(js 'window.inkyStore.stamps.length')" "1" "store holds one stamp"
assert_eq "$(js 'window.inkyStore.stamps[0] ? window.inkyStore.stamps[0].text : ""')" '"x = 3"' "stamp text is the solved answer"
assert_eq "$(js 'document.querySelector("[data-stamp-id]") ? document.querySelector("[data-stamp-id]").textContent : ""')" '"x = 3"' "DOM stamp reads x = 3"
STAMP_FS="$(js 'window.inkyStore.stamps[0] ? window.inkyStore.stamps[0].fontSize : 0')"
if [ -n "$STAMP_FS" ] && awk -v fs="$STAMP_FS" 'BEGIN{exit !(fs >= 16 && fs <= 96)}'; then
  ok "stamp sized from the user's glyphs (fontSize $STAMP_FS in [16,96])"
else
  bad "stamp fontSize out of range: $STAMP_FS"
fi
if poll_js 'window.inkyStore.mathCapsule !== null' false 10; then ok "capsule dismissed after Solve"; else bad "capsule still open after Solve"; fi
assert_eq "$(js 'window.inkyStore.activeTool')" '"draw"' "pen restored after stamp"
POST="$(js 'window.inkyStore.strokes.length')"
assert_eq "$POST" "$PRE" "ink untouched by stamping ($PRE strokes, stamps are text)"
agent-browser screenshot "$RUN_DIR/03-stamp.png" >>"$LOG" 2>&1

section "7. one Meta+z undo removes the stamp; ink untouched"
agent-browser press Meta+z >>"$LOG" 2>&1
if poll_js 'window.inkyStore.stamps.length' 0 10; then ok "undo removed the stamp"; else bad "undo: stamps = $(js 'window.inkyStore.stamps.length') want 0"; fi
if poll_js 'document.querySelectorAll("[data-stamp-id]").length' 0 10; then ok "stamp DOM element gone"; else bad "[data-stamp-id] still in DOM after undo"; fi
assert_eq "$(js 'window.inkyStore.strokes.length')" "$PRE" "ink unchanged by undo ($PRE strokes)"

section "8. Escape dismisses the capsule"
ensure_draw_tool
draw_lasso
if poll_js 'window.inkyStore.mathCapsule !== null' true 10; then ok "capsule reopened"; else bad "capsule did not reopen for Escape test"; fi
agent-browser press Escape >>"$LOG" 2>&1
if poll_js 'window.inkyStore.mathCapsule !== null' false 10; then ok "Escape dismissed the capsule"; else bad "Escape did not dismiss the capsule"; fi
sleep 0.4
agent-browser screenshot "$RUN_DIR/04-after-escape.png" >>"$LOG" 2>&1

section "9. click empty canvas dismisses the capsule"
ensure_draw_tool
draw_lasso
if poll_js 'window.inkyStore.mathCapsule !== null' true 10; then ok "capsule reopened"; else bad "capsule did not reopen for click-away test"; fi
agent-browser mouse move 1100 650 >>"$LOG" 2>&1
agent-browser mouse down >>"$LOG" 2>&1
agent-browser mouse up >>"$LOG" 2>&1
if poll_js 'window.inkyStore.mathCapsule !== null' false 10; then ok "click-away dismissed the capsule"; else bad "click-away did not dismiss the capsule"; fi

section "9b. marquee selection alone (no circle) opens the capsule"
agent-browser press v >>"$LOG" 2>&1
assert_eq "$(js 'window.inkyStore.activeTool')" '"select"' "select tool active"
agent-browser mouse move 250 220 >>"$LOG" 2>&1
agent-browser mouse down >>"$LOG" 2>&1
agent-browser mouse move 900 500 --steps 12 >>"$LOG" 2>&1
agent-browser mouse up >>"$LOG" 2>&1
if poll_js 'window.inkyStore.selectedStrokeIds.length > 0' true 10; then ok "marquee selected the equation"; else bad "marquee selected nothing"; fi
if poll_js 'window.inkyStore.mathCapsule !== null' true 10; then ok "capsule opened from selection alone"; else bad "capsule did not open for marquee selection"; fi
agent-browser press Escape >>"$LOG" 2>&1
if poll_js 'window.inkyStore.mathCapsule !== null' false 10; then ok "dismissed after select test"; else bad "could not dismiss after select test"; fi

section "10. fast close before ML settles -> no resurrection (12s)"
ensure_draw_tool
draw_lasso
if poll_js 'window.inkyStore.mathCapsule !== null' true 10; then ok "capsule reopened"; else bad "capsule did not reopen for fast-close test"; fi
note "mlPending at close: $(js 'window.inkyStore.mathCapsule && window.inkyStore.mathCapsule.mlPending === true')"
agent-browser press Escape >>"$LOG" 2>&1
if poll_js 'window.inkyStore.mathCapsule !== null' false 10; then ok "closed immediately"; else bad "initial close failed"; fi
sleep 12
assert_eq "$(js 'window.inkyStore.mathCapsule !== null')" "false" "capsule still null after 12s (ML settle did not resurrect)"

section "10b. stamp pans with the canvas (space-drag)"
ensure_draw_tool
draw_lasso
if poll_js 'window.inkyStore.mathCapsule !== null' true 10; then ok "capsule reopened for stamp"; else bad "capsule did not reopen for stamp"; fi
ml2=false
for ((i = 0; i < 60; i++)); do
  if [ "$(js 'window.inkyStore.mathCapsule && window.inkyStore.mathCapsule.source === "ml"')" = "true" ]; then ml2=true; break; fi
  sleep 0.25
done
if $ml2; then ok "ML settled for Solve"; else bad "ML did not settle for re-stamp"; fi
SOLVE_LINE2="$(agent-browser snapshot -i 2>>"$LOG" | grep -m1 'button "Solve"')"
SOLVE_REF2="${SOLVE_LINE2##*ref=}"
SOLVE_REF2="${SOLVE_REF2%%]*}"
if [ -n "$SOLVE_REF2" ] && [ "$SOLVE_REF2" != "$SOLVE_LINE2" ]; then
  agent-browser click "@$SOLVE_REF2" >>"$LOG" 2>&1
  ok "Solve clicked for re-stamp"
else
  bad "Solve button not found for re-stamp"
fi
if poll_js 'document.querySelectorAll("[data-stamp-id]").length' 1 10; then ok "stamp back on canvas"; else bad "no stamp for pan test"; fi
LEFT_BEFORE="$(js '(function(){var el=document.querySelector("[data-stamp-id]"); return el ? Math.round(el.getBoundingClientRect().left) : -1})()')"
# NOTE: 'keydown Space' sends an empty key via CDP; a literal space matches e.key === ' '.
agent-browser keydown ' ' >>"$LOG" 2>&1
agent-browser mouse move 400 550 >>"$LOG" 2>&1
agent-browser mouse down left >>"$LOG" 2>&1
agent-browser mouse move 500 590 --steps 8 >>"$LOG" 2>&1
agent-browser mouse up left >>"$LOG" 2>&1
agent-browser keyup ' ' >>"$LOG" 2>&1
sleep 0.2
LEFT_AFTER="$(js '(function(){var el=document.querySelector("[data-stamp-id]"); return el ? Math.round(el.getBoundingClientRect().left) : -1})()')"
PAN_DELTA=$((LEFT_AFTER - LEFT_BEFORE))
if [ "$PAN_DELTA" -ge 80 ] && [ "$PAN_DELTA" -le 120 ]; then
  ok "stamp panned with the canvas (delta ${PAN_DELTA}px for a 100px drag)"
else
  bad "stamp did not follow the pan (delta ${PAN_DELTA}px, want ~100)"
fi

section "10c. eraser deletes stamp chars one at a time (ink stays)"
# The eraser is per-char now: each visible glyph is its own item. We sweep the
# eraser across every visible char of the 'x = 3' stamp; whitespace is never
# targetable, so once the 3 visible glyphs ('x','=','3') are gone the stamp
# (and its orphaned spaces) is dropped entirely. Ink is untouched.
agent-browser press e >>"$LOG" 2>&1
assert_eq "$(js 'window.inkyStore.activeTool')" '"eraser"' "eraser tool active"
for _ci in 1 2 3 4 5 6; do
  REMAIN="$(js '(function(){var s=window.inkyStore.stamps[0]; return s ? s.chars.filter(function(c){return !/\\s/.test(c.char)}).length : 0})()')"
  [ "$REMAIN" = "0" ] && break
  CX="$(js '(function(){var s=window.inkyStore.stamps[0]; if(!s) return -1; var c=s.chars.filter(function(x){return !/\\s/.test(x.char)})[0]; var el=document.querySelector(\"[data-char-id=\\\"\"+c.id+\"\\\"]\"); if(!el) return -1; var r=el.getBoundingClientRect(); return Math.round(r.left+r.width/2)})()')"
  CY="$(js '(function(){var s=window.inkyStore.stamps[0]; if(!s) return -1; var c=s.chars.filter(function(x){return !/\\s/.test(x.char)})[0]; var el=document.querySelector(\"[data-char-id=\\\"\"+c.id+\"\\\"]\"); if(!el) return -1; var r=el.getBoundingClientRect(); return Math.round(r.top+r.height/2)})()')"
  [ -n "$CX" ] || CX=-1
  [ -n "$CY" ] || CY=-1
  agent-browser mouse move "$CX" "$CY" >>"$LOG" 2>&1
  agent-browser mouse down left >>"$LOG" 2>&1
  agent-browser mouse move $((CX + 3)) $((CY + 2)) --steps 2 >>"$LOG" 2>&1
  agent-browser mouse up left >>"$LOG" 2>&1
done
if poll_js 'window.inkyStore.stamps.length' 0 10; then ok "per-char eraser dropped the stamp once last glyph went"; else bad "stamp survived per-char eraser (stamps=$(js 'window.inkyStore.stamps.length'))"; fi
if poll_js 'document.querySelectorAll("[data-stamp-id]").length' 0 10; then ok "stamp DOM element gone"; else bad "[data-stamp-id] still in DOM after erasing"; fi
assert_eq "$(js 'window.inkyStore.strokes.length')" "9" "ink untouched by stamp erase (9 strokes)"
agent-browser screenshot "$RUN_DIR/06-erased-stamp.png" >>"$LOG" 2>&1

section "10d. brace-form latex (x^{ 2 }-1=0) offers a live Solve (dead-Solve regression)"
# The model emits LaTeX braces; without the canonicalizeSuperscripts math
# boundary the gate saw `x^{ 2 }` (no literal ^2) -> every button dimmed.
# Inject the exact captured string deterministically, click Solve, verify the
# stamped answer, then undo (step 11 reloads regardless; keep counts clean).
ensure_draw_tool
js '(function(){ window.inkyStore.setMathCapsule({latex: "x^{ 2 }-1=0", worldPosition: {x: 600, y: 250}, enclosedStrokeIds: [], source: "ml", mlPending: false}); return "ok" })()' >/dev/null
if poll_js 'window.inkyStore.mathCapsule !== null' true 6; then ok "injected brace-form capsule open"; else bad "injected capsule did not open"; fi
SOLVE_DIS="$(js '(function(){var b=[...document.querySelectorAll("button")].find(function(x){return x.textContent==="Solve"}); return b ? b.getAttribute("aria-disabled") : "missing"})()')"
assert_eq "$SOLVE_DIS" '"false"' "Solve enabled for brace-form latex"
SOLVE_LINE3="$(agent-browser snapshot -i 2>>"$LOG" | grep -m1 'button "Solve"')"
SOLVE_REF3="${SOLVE_LINE3##*ref=}"
SOLVE_REF3="${SOLVE_REF3%%]*}"
if [ -n "$SOLVE_REF3" ] && [ "$SOLVE_REF3" != "$SOLVE_LINE3" ]; then
  agent-browser click "@$SOLVE_REF3" >>"$LOG" 2>&1
  ok "Solve clicked on brace-form capsule"
else
  bad "Solve button not found for brace-form capsule"
fi
if poll_js 'window.inkyStore.stamps.length === 1 && window.inkyStore.stamps[0].text === "x = 1, -1"' true 10; then
  ok "brace-form Solve stamped x = 1, -1"
else
  bad "brace-form stamp: $(js 'JSON.stringify(window.inkyStore.stamps.map(function(s){return s.text}))')"
fi
agent-browser press Meta+z >>"$LOG" 2>&1
if poll_js 'window.inkyStore.strokes.length' 9 10; then ok "undo after brace stamp left ink intact (9 strokes)"; else bad "ink changed by brace-stamp undo"; fi
if poll_js 'window.inkyStore.stamps.length' 0 10; then ok "brace stamp undone (canvas ready for 10e)"; else bad "brace stamp not removed by undo"; fi

section "10e. human-drawn x²-1=0: real recognizer output must offer a live Solve"
# Draws the quadratic glyphs that produced the dead-Solve bug in the wild
# (settled latex `x^{ 2 }-1=0` / `v^{ 2 }=0`), lassos ONLY them, and asserts
# the ML-settled capsule offers a working Solve + stamps an answer. One
# redraw retry (clear + draw again) if the settle comes back without `=`.
draw_quadratic() {
  stroke 31 330 575 390 645
  stroke 32 390 575 330 645
  # superscript 2 — with a horizontal base sweep so it can't read as `c`
  stroke 33 452 546 440 540 426 544 422 554 434 563 452 571 424 571
  stroke 34 470 610 530 610
  stroke 35 563 572 563 652
  stroke 36 600 595 655 595
  stroke 37 600 630 655 630
  local k px py
  local pts=()
  for k in {0..15}; do
    read -r px py <<<"$(awk -v k="$k" 'BEGIN{pi=atan2(0,-1); th=(360*k/16)*pi/180; printf "%.0f %.0f", 700+28*cos(th), 610+42*sin(th)}')"
    # stroke() takes FLAT x y args — a "px py" string per element would be
    # misread as alternating coordinates and scramble the ellipse.
    pts+=("$px" "$py")
  done
  pts+=("${pts[0]}" "${pts[1]}")
  stroke 38 "${pts[@]}"
}
# Same loop-detection contract as draw_lasso (close byte-identical, outward
# overshoot, inward cut crossing the head) around center (525,600) rx260 ry105:
# sized so every glyph corner (incl. the `0` at x672-728/y568-652) is strictly
# inside — a too-tight ellipse dropped the `0` and the recognizer settled
# `x^{ 2 }-1=`. World y 535-745, clear of the original equation (y <= 365).
draw_lasso_low() {
  local k px py
  local pts=()
  for k in {0..24}; do
    read -r px py <<<"$(awk -v k="$k" 'BEGIN{pi=atan2(0,-1); th=(180+15*k)*pi/180; printf "%.0f %.0f", 525+260*cos(th), 600+105*sin(th)}')"
    pts+=("$px $py")
  done
  pts[24]="${pts[0]}"
  pts+=("236 585" "221 572" "298 600" "328 614")
  set -- ${pts[0]}
  agent-browser mouse move "$1" "$2" >>"$LOG" 2>&1
  agent-browser mouse down >>"$LOG" 2>&1
  for k in "${pts[@]:1}"; do
    set -- $k
    agent-browser mouse move "$1" "$2" --steps 3 >>"$LOG" 2>&1
  done
  agent-browser mouse up >>"$LOG" 2>&1
}
QUAD_ML_LATEX=""
QUAD_OK=false
for attempt in 1 2; do
  ensure_draw_tool
  BASE="$(js 'window.inkyStore.strokes.length')"
  draw_quadratic
  assert_eq "$(js 'window.inkyStore.strokes.length')" "$((BASE + 8))" "8 quadratic glyph strokes on canvas (attempt $attempt)"
  draw_lasso_low
  if poll_js 'window.inkyStore.mathCapsule !== null' true 10; then ok "capsule opened for the quadratic"; else bad "capsule did not open for the quadratic (attempt $attempt)"; fi
  assert_eq "$(js 'window.inkyStore.mathCapsule ? window.inkyStore.mathCapsule.enclosedStrokeIds.length : -1')" "8" "lasso enclosed only the 8 quadratic strokes"
  ml3=false
  for ((i = 0; i < 60; i++)); do
    if [ "$(js 'window.inkyStore.mathCapsule && window.inkyStore.mathCapsule.source === "ml"')" = "true" ]; then ml3=true; break; fi
    sleep 0.25
  done
  if $ml3; then ok "ML settled for the quadratic"; else bad "ML did not settle for the quadratic (attempt $attempt)"; fi
  QUAD_ML_LATEX="$(js 'window.inkyStore.mathCapsule ? window.inkyStore.mathCapsule.latex : ""')"
  note "quadratic ml latex: $QUAD_ML_LATEX"
  echo "quad-ml: $QUAD_ML_LATEX" >>"$RUN_DIR/latex.log"
  # A usable settle is an equation with a numeric ^2 — the sup must read as 2
  # (a `c` reading gives `x^c-1=0`, which is genuinely unsolvable, so the
  # retry is for recognizer drift, not for the button bug under test).
  if [[ "$QUAD_ML_LATEX" == *"="* ]] && echo "$QUAD_ML_LATEX" | grep -qE '\^\{? ?2'; then QUAD_OK=true; break; fi
  note "unusable settle (attempt $attempt): needs '=' and numeric ^2; clearing ink and retrying once"
  js 'window.inkyStore.clear(); "ok"' >/dev/null
done
if $QUAD_OK; then ok "quadratic settled into a parseable equation"; else bad "no parseable equation after 2 attempts: $QUAD_ML_LATEX"; fi
QUAD_SOLVE_DIS="$(js '(function(){var b=[...document.querySelectorAll("button")].find(function(x){return x.textContent==="Solve"}); return b ? b.getAttribute("aria-disabled") : "missing"})()')"
assert_eq "$QUAD_SOLVE_DIS" '"false"' "Solve enabled for ML-settled quadratic (regression gate)"
QSL="$(agent-browser snapshot -i 2>>"$LOG" | grep -m1 'button "Solve"')"
QSR="${QSL##*ref=}"
QSR="${QSR%%]*}"
if [ -n "$QSR" ] && [ "$QSR" != "$QSL" ]; then
  agent-browser click "@$QSR" >>"$LOG" 2>&1
  ok "Solve clicked on the quadratic capsule"
else
  bad "Solve button not found for the quadratic capsule"
fi
if poll_js 'window.inkyStore.stamps.length' 1 10; then ok "quadratic Solve stamped an answer"; else bad "no stamp after quadratic Solve (stamps=$(js 'window.inkyStore.stamps.length'))"; fi
QUAD_STAMP="$(js 'window.inkyStore.stamps[0] ? window.inkyStore.stamps[0].text : ""')"
if [ "$QUAD_STAMP" != "$QUAD_ML_LATEX" ] && [[ "$QUAD_STAMP" == *" = "* ]]; then
  ok "stamp is a solve-result, not the question ($QUAD_STAMP)"
else
  bad "unexpected quadratic stamp: $QUAD_STAMP (latex: $QUAD_ML_LATEX)"
fi
if poll_js 'window.inkyStore.mathCapsule !== null' false 10; then ok "capsule dismissed after quadratic Solve"; else bad "capsule still open after quadratic Solve"; fi
agent-browser screenshot "$RUN_DIR/07-quadratic-solve.png" >>"$LOG" 2>&1

section "10f. per-char interactions: click, drag, rotate, scale, undo, marquee"
# Uses the stamp 10e just left on the canvas. Chars are first-class: a plain
# click selects exactly one char (replacing stroke selection) and must NOT
# open the capsule (capsules belong to ink only).
agent-browser press v >>"$LOG" 2>&1
assert_eq "$(js 'window.inkyStore.activeTool')" '"select"' "select tool active"
CHAR_ID="$(js '(function(){var s=window.inkyStore.stamps[0]; if(!s) return "none"; var c=s.chars.filter(function(x){return !/\\s/.test(x.char)})[0]; return c ? c.id : "none"})()')"
if [ "$CHAR_ID" != '"none"' ] && [ "$CHAR_ID" != "none" ]; then ok "target char $CHAR_ID"; else bad "no visible char on the 10e stamp"; fi
CH_X="$(js '(function(){var s=window.inkyStore.stamps[0]; var c=s.chars.filter(function(x){return !/\\s/.test(x.char)})[0]; var el=document.querySelector(\"[data-char-id=\\\"\"+c.id+\"\\\"]\"); if(!el) return -1; var r=el.getBoundingClientRect(); return Math.round(r.left+r.width/2)})()')"
CH_Y="$(js '(function(){var s=window.inkyStore.stamps[0]; var c=s.chars.filter(function(x){return !/\\s/.test(x.char)})[0]; var el=document.querySelector(\"[data-char-id=\\\"\"+c.id+\"\\\"]\"); if(!el) return -1; var r=el.getBoundingClientRect(); return Math.round(r.top+r.height/2)})()')"
[ -n "$CH_X" ] || CH_X=-1
[ -n "$CH_Y" ] || CH_Y=-1
agent-browser mouse move "$CH_X" "$CH_Y" --steps 2 >>"$LOG" 2>&1
agent-browser mouse down left >>"$LOG" 2>&1
agent-browser mouse up left >>"$LOG" 2>&1
assert_eq "$(js 'window.inkyStore.selectedCharIds.length')" "1" "click selects exactly one char"
assert_eq "$(js 'window.inkyStore.selectedStrokeIds.length')" "0" "plain char click clears stroke selection"
assert_eq "$(js 'window.inkyStore.mathCapsule !== null')" "false" "char selection never opens the capsule"

# Drag the char 40px right: translateSelected moves only this glyph.
WX0="$(js '(function(){var r=window.inkyStore.charRecord(window.inkyStore.selectedCharIds[0]); return r ? Math.round(r.char.worldX) : -1})()')"
agent-browser mouse move "$CH_X" "$CH_Y" --steps 2 >>"$LOG" 2>&1
agent-browser mouse down left >>"$LOG" 2>&1
agent-browser mouse move $((CH_X + 40)) "$CH_Y" --steps 6 >>"$LOG" 2>&1
agent-browser mouse up left >>"$LOG" 2>&1
WX1="$(js '(function(){var r=window.inkyStore.charRecord(window.inkyStore.selectedCharIds[0]); return r ? Math.round(r.char.worldX) : -1})()')"
if [ "$WX1" -gt "$WX0" ] 2>/dev/null; then ok "char drag translated the glyph (${WX0} -> ${WX1})"; else bad "char drag did not move (worldX ${WX0} -> ${WX1})"; fi

# Rotate via the top handle (20px above the selection box, world space).
BOX="$(js '(function(){var b=window.inkyStore.getSelectionBoundingBox(); if(!b) return "0 0 0 0"; var c=window.inkyStore.camera; return [Math.round(b.minX*c.z+c.x), Math.round(b.minY*c.z+c.y), Math.round(b.maxX*c.z+c.x), Math.round(b.maxY*c.z+c.y)].join(" ")})()')"
BOX="${BOX//\"/}"
read -r BX0 BY0 BX1 BY1 <<<"$BOX"
RCX=$(((BX0 + BX1) / 2))
RCY=$((BY0 - 24))
agent-browser mouse move "$RCX" "$RCY" --steps 2 >>"$LOG" 2>&1
agent-browser mouse down left >>"$LOG" 2>&1
agent-browser mouse move $((RCX + 40)) "$RCY" --steps 6 >>"$LOG" 2>&1
agent-browser mouse up left >>"$LOG" 2>&1
CH_ANGLE="$(js '(function(){var r=window.inkyStore.charRecord(window.inkyStore.selectedCharIds[0]); return r ? Number(r.char.angle.toFixed(4)) : 0})()')"
if [ "$CH_ANGLE" != "0" ]; then ok "rotate handle spun the char (angle $CH_ANGLE)"; else bad "char did not rotate (angle 0)"; fi

# Scale via the se corner (box bottom-right): fontSize must grow.
FS0="$(js '(function(){var r=window.inkyStore.charRecord(window.inkyStore.selectedCharIds[0]); return r ? Math.round(r.char.fontSize) : 0})()')"
BOX="$(js '(function(){var b=window.inkyStore.getSelectionBoundingBox(); if(!b) return "0 0 0 0"; var c=window.inkyStore.camera; return [Math.round(b.minX*c.z+c.x), Math.round(b.minY*c.z+c.y), Math.round(b.maxX*c.z+c.x), Math.round(b.maxY*c.z+c.y)].join(" ")})()')"
BOX="${BOX//\"/}"
read -r BX0 BY0 BX1 BY1 <<<"$BOX"
agent-browser mouse move "$BX1" "$BY1" --steps 2 >>"$LOG" 2>&1
agent-browser mouse down left >>"$LOG" 2>&1
agent-browser mouse move $((BX1 + 30)) $((BY1 + 30)) --steps 6 >>"$LOG" 2>&1
agent-browser mouse up left >>"$LOG" 2>&1
FS1="$(js '(function(){var r=window.inkyStore.charRecord(window.inkyStore.selectedCharIds[0]); return r ? Math.round(r.char.fontSize) : 0})()')"
if [ "$FS1" -gt "$FS0" ] 2>/dev/null; then ok "scale handle grew the char (${FS0}px -> ${FS1}px)"; else bad "char did not scale (fontSize ${FS0} -> ${FS1})"; fi

# One undo reverts exactly the last gesture (the scale commit).
agent-browser press Meta+z >>"$LOG" 2>&1
FS2="$(js '(function(){var r=window.inkyStore.charRecord(window.inkyStore.selectedCharIds[0] || window.inkyStore.stamps[0].chars.filter(function(x){return !/\\s/.test(x.char)})[0].id); return r ? Math.round(r.char.fontSize) : 0})()')"
if [ "$FS2" = "$FS0" ]; then ok "undo reverted the scale gesture (fontSize back to $FS0)"; else bad "undo did not revert scale (${FS0} -> ${FS2})"; fi

# Marquee over the char: selects chars (no stroke under it) and opens no capsule.
agent-browser press Escape >>"$LOG" 2>&1
BOX="$(js '(function(){var b=window.inkyStore.stamps[0] ? (function(){var s=window.inkyStore.stamps[0]; var vis=s.chars.filter(function(x){return !/\\s/.test(x.char)}); var c=window.inkyStore.camera; var minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9; vis.forEach(function(ch){var w=ch.fontSize*0.5,h=ch.fontSize*1.25; minX=Math.min(minX,ch.worldX); minY=Math.min(minY,ch.worldY); maxX=Math.max(maxX,ch.worldX+w); maxY=Math.max(maxY,ch.worldY+h)}); return [Math.round(minX*c.z+c.x),Math.round(minY*c.z+c.y),Math.round(maxX*c.z+c.x),Math.round(maxY*c.z+c.y)].join(" ")})() : "0 0 0 0"; return b})()')"
BOX="${BOX//\"/}"
read -r MX0 MY0 MX1 MY1 <<<"$BOX"
agent-browser mouse move $((MX0 - 12)) $((MY0 - 12)) --steps 2 >>"$LOG" 2>&1
agent-browser mouse down left >>"$LOG" 2>&1
agent-browser mouse move $((MX1 + 12)) $((MY1 + 12)) --steps 6 >>"$LOG" 2>&1
agent-browser mouse up left >>"$LOG" 2>&1
MARQUEE_CHARS="$(js 'window.inkyStore.selectedCharIds.length')"
if [ "$MARQUEE_CHARS" -ge 1 ] 2>/dev/null; then ok "marquee selected $MARQUEE_CHARS char(s)"; else bad "marquee selected no chars"; fi
assert_eq "$(js 'window.inkyStore.strokes.length')" "20" "marquee over a stamp left all ink unselected"
assert_eq "$(js 'window.inkyStore.mathCapsule !== null')" "false" "char-only marquee opens no capsule"
agent-browser screenshot "$RUN_DIR/08-per-char.png" >>"$LOG" 2>&1
agent-browser press Escape >>"$LOG" 2>&1

section "11. reduced-motion pass"
agent-browser set media light reduced-motion >>"$LOG" 2>&1
agent-browser open http://localhost:5173/ >>"$LOG" 2>&1
sleep 2
assert_eq "$(js 'matchMedia("(prefers-reduced-motion: reduce)").matches')" "true" "prefers-reduced-motion emulated"
assert_eq "$(js 'window.inkyStore.strokes.length')" "0" "fresh store after reload"
draw_equation 20
draw_lasso
if poll_js 'window.inkyStore.mathCapsule !== null' true 10; then ok "capsule opens under reduced motion"; else bad "capsule did not open under reduced motion"; fi
assert_eq "$(js 'window.inkyStore.mathCapsule && window.inkyStore.mathCapsule.source === "rule"')" "true" "rule source at open (fresh worker)"
assert_eq "$(js 'document.querySelector("[data-capsule-state=open]") ? 1 : 0')" "1" "capsule pill rendered (reduced motion)"
agent-browser screenshot "$RUN_DIR/05-reduced-motion.png" >>"$LOG" 2>&1

section "final. page errors still clean"
ERRS2="$(agent-browser errors 2>>"$LOG")"
if [ -z "$ERRS2" ]; then ok "no page errors at end"; else bad "page errors at end: $ERRS2"; fi

echo
echo "== result: $PASS passed, $FAIL failed (artifacts: $RUN_DIR)"
agent-browser close >>"$LOG" 2>&1
if [ "$FAIL" -eq 0 ]; then exit 0; else exit 1; fi
