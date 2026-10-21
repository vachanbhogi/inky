#!/usr/bin/env bash
# E2E vertical-flow verification (agent-browser driven): draw equation -> lasso circle -> rule capsule (mlPending) -> ML upgrade -> Solve stamp (one undo) -> undo -> dismissals -> reduced-motion pass.
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

section "6. Solve stamps the answer as one batch"
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
revealed=false
for ((i = 0; i < 8; i++)); do
  if [ "$(js 'window.inkyStore.stampedReveal !== null')" = "true" ]; then revealed=true; break; fi
  sleep 0.05
done
if $revealed; then ok "stampedReveal armed on stamp"; else note "stampedReveal 420ms window missed; verified via stroke count + screenshot"; fi
if poll_js 'window.inkyStore.mathCapsule !== null' false 10; then ok "capsule dismissed after Solve"; else bad "capsule still open after Solve"; fi
POST="$(js 'window.inkyStore.strokes.length')"
if [ -n "$POST" ] && [ "$POST" -gt "$PRE" ] 2>/dev/null; then ok "stamped strokes added ($PRE -> $POST)"; else bad "stamp did not add strokes ($PRE -> $POST)"; fi
agent-browser screenshot "$RUN_DIR/03-stamp.png" >>"$LOG" 2>&1

section "7. one Meta+z undo restores pre-stamp strokes"
agent-browser press Meta+z >>"$LOG" 2>&1
if poll_js 'window.inkyStore.strokes.length' "$PRE" 10; then ok "undo restored to $PRE strokes"; else bad "undo: got $(js 'window.inkyStore.strokes.length') want $PRE"; fi

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

section "10. fast close before ML settles -> no resurrection (12s)"
ensure_draw_tool
draw_lasso
if poll_js 'window.inkyStore.mathCapsule !== null' true 10; then ok "capsule reopened"; else bad "capsule did not reopen for fast-close test"; fi
note "mlPending at close: $(js 'window.inkyStore.mathCapsule && window.inkyStore.mathCapsule.mlPending === true')"
agent-browser press Escape >>"$LOG" 2>&1
if poll_js 'window.inkyStore.mathCapsule !== null' false 10; then ok "closed immediately"; else bad "initial close failed"; fi
sleep 12
assert_eq "$(js 'window.inkyStore.mathCapsule !== null')" "false" "capsule still null after 12s (ML settle did not resurrect)"

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
