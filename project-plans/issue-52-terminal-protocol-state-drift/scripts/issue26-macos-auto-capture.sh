#!/usr/bin/env bash

# Automated Issue #26 capture harness (macOS GUI key-event driven).
#
# This wrapper runs the existing manual capture script and uses
# issue26-macos-keydriver.py to inject key events.

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/issue26-macos-auto-capture.sh [options]

Options:
  --out-dir <dir>          Output root dir (default: /tmp/issue26-macos-auto-<timestamp>)
  --start-command <cmd>    Command to launch LLXPRT (default: node scripts/start.js --yolo)
  --scenario <name>        english_quit | ime_quit_only | ime_interrupt_then_quit
                           (default: ime_interrupt_then_quit)
  --app <name>             Target app for activation, default auto
  --iterations <n>         Number of runs (default: 3)
  --stop-on-repro <yes|no> Stop after first suspected reproduction (default: yes)
  --expect-suspected <v>   any | yes | no (default: any)
  --require-ok-runs <n>    Minimum analysis_ok runs for expectation check (default: 1)
  --warmup-prompt <text>   Optional prompt submitted before reproduction trigger
  --warmup-submit <yes|no> Press Enter after warmup prompt (default: yes)
  --wait-for-substring <s> Wait transcript until substring appears
  --wait-substring-timeout <sec>
                           Timeout for --wait-for-substring (default: 120)
  --activity-growth-bytes <n>
                           Wait transcript growth bytes before trigger (default: 0)
  --activity-timeout <sec> Timeout for --activity-growth-bytes (default: 120)
  --runtime-wait-ms <n>    Extra wait before trigger after conditions (default: 0)
  --fail-on-activate <v>   yes | no (default: no)
  --repro-inject-mode <v>  applescript | tty | hybrid (default: applescript)
  --probe-inject-mode <v>  applescript | tty | hybrid (default: hybrid)
  --probe-send-retries <n> Probe send attempts per key (default: 2)
  --probe-send-delay-ms <n>
                           Delay between probe send attempts (default: 220)
  --initial-delay-ms <n>   Delay before repro sequence (default: 6000)
  --step-delay-ms <n>      Delay between key events (default: 350)
  --ime-text <text>        IME payload (default: 測試)
  --preedit-text <text>    Preedit payload (default: nihao)
  --runner-timeout <sec>   Wait for runner start marker (default: 60)
  --probe-timeout <sec>    Wait for probe markers (default: 120)
  --probe-window <sec>     Seconds for each probe input window (default: 10)
  -h, --help               Show help

Output:
  - run-<n>/summary.json per run
  - run-<n>/keydriver.log per run
  - aggregate.json / aggregate.md in output root
EOF
}

OUT_DIR=""
START_COMMAND="node scripts/start.js --yolo"
SCENARIO="ime_interrupt_then_quit"
APP_NAME="auto"
ITERATIONS=3
STOP_ON_REPRO="yes"
EXPECT_SUSPECTED="any"
REQUIRE_OK_RUNS=1
WARMUP_PROMPT=""
WARMUP_SUBMIT="yes"
WAIT_FOR_SUBSTRING=""
WAIT_SUBSTRING_TIMEOUT=120
ACTIVITY_GROWTH_BYTES=0
ACTIVITY_TIMEOUT=120
RUNTIME_WAIT_MS=0
FAIL_ON_ACTIVATE="no"
REPRO_INJECT_MODE="applescript"
PROBE_INJECT_MODE="hybrid"
PROBE_SEND_RETRIES=2
PROBE_SEND_DELAY_MS=220
INITIAL_DELAY_MS=6000
STEP_DELAY_MS=350
IME_TEXT="測試"
PREEDIT_TEXT="nihao"
RUNNER_TIMEOUT=60
PROBE_TIMEOUT=120
PROBE_WINDOW=10

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out-dir)
      OUT_DIR="$2"
      shift 2
      ;;
    --start-command)
      START_COMMAND="$2"
      shift 2
      ;;
    --scenario)
      SCENARIO="$2"
      shift 2
      ;;
    --app)
      APP_NAME="$2"
      shift 2
      ;;
    --iterations)
      ITERATIONS="$2"
      shift 2
      ;;
    --stop-on-repro)
      STOP_ON_REPRO="$2"
      shift 2
      ;;
    --expect-suspected)
      EXPECT_SUSPECTED="$2"
      shift 2
      ;;
    --require-ok-runs)
      REQUIRE_OK_RUNS="$2"
      shift 2
      ;;
    --warmup-prompt)
      WARMUP_PROMPT="$2"
      shift 2
      ;;
    --warmup-submit)
      WARMUP_SUBMIT="$2"
      shift 2
      ;;
    --wait-for-substring)
      WAIT_FOR_SUBSTRING="$2"
      shift 2
      ;;
    --wait-substring-timeout)
      WAIT_SUBSTRING_TIMEOUT="$2"
      shift 2
      ;;
    --activity-growth-bytes)
      ACTIVITY_GROWTH_BYTES="$2"
      shift 2
      ;;
    --activity-timeout)
      ACTIVITY_TIMEOUT="$2"
      shift 2
      ;;
    --runtime-wait-ms)
      RUNTIME_WAIT_MS="$2"
      shift 2
      ;;
    --fail-on-activate)
      FAIL_ON_ACTIVATE="$2"
      shift 2
      ;;
    --repro-inject-mode)
      REPRO_INJECT_MODE="$2"
      shift 2
      ;;
    --probe-inject-mode)
      PROBE_INJECT_MODE="$2"
      shift 2
      ;;
    --probe-send-retries)
      PROBE_SEND_RETRIES="$2"
      shift 2
      ;;
    --probe-send-delay-ms)
      PROBE_SEND_DELAY_MS="$2"
      shift 2
      ;;
    --initial-delay-ms)
      INITIAL_DELAY_MS="$2"
      shift 2
      ;;
    --step-delay-ms)
      STEP_DELAY_MS="$2"
      shift 2
      ;;
    --ime-text)
      IME_TEXT="$2"
      shift 2
      ;;
    --preedit-text)
      PREEDIT_TEXT="$2"
      shift 2
      ;;
    --runner-timeout)
      RUNNER_TIMEOUT="$2"
      shift 2
      ;;
    --probe-timeout)
      PROBE_TIMEOUT="$2"
      shift 2
      ;;
    --probe-window)
      PROBE_WINDOW="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if ! command -v python3 >/dev/null 2>&1; then
  echo "Missing required command: python3" >&2
  exit 1
fi
if ! command -v osascript >/dev/null 2>&1; then
  echo "Missing required command: osascript (macOS only)" >&2
  exit 1
fi

if [[ -z "$OUT_DIR" ]]; then
  OUT_DIR="/tmp/issue26-macos-auto-$(date +%Y%m%d-%H%M%S)"
fi
OUT_DIR="$(cd "$(dirname "$OUT_DIR")" && pwd)/$(basename "$OUT_DIR")"
mkdir -p "$OUT_DIR"

ROOT_DIR="$(pwd)"

case "$SCENARIO" in
  english_quit|ime_quit_only|ime_interrupt_then_quit) ;;
  *)
    echo "Invalid --scenario: $SCENARIO" >&2
    exit 1
    ;;
esac

if [[ "$STOP_ON_REPRO" != "yes" && "$STOP_ON_REPRO" != "no" ]]; then
  echo "Invalid --stop-on-repro: $STOP_ON_REPRO (use yes|no)" >&2
  exit 1
fi
if [[ "$EXPECT_SUSPECTED" != "any" && "$EXPECT_SUSPECTED" != "yes" && "$EXPECT_SUSPECTED" != "no" ]]; then
  echo "Invalid --expect-suspected: $EXPECT_SUSPECTED (use any|yes|no)" >&2
  exit 1
fi
if [[ "$WARMUP_SUBMIT" != "yes" && "$WARMUP_SUBMIT" != "no" ]]; then
  echo "Invalid --warmup-submit: $WARMUP_SUBMIT (use yes|no)" >&2
  exit 1
fi
if [[ "$FAIL_ON_ACTIVATE" != "yes" && "$FAIL_ON_ACTIVATE" != "no" ]]; then
  echo "Invalid --fail-on-activate: $FAIL_ON_ACTIVATE (use yes|no)" >&2
  exit 1
fi
case "$REPRO_INJECT_MODE" in
  applescript|tty|hybrid) ;;
  *)
    echo "Invalid --repro-inject-mode: $REPRO_INJECT_MODE" >&2
    exit 1
    ;;
esac
case "$PROBE_INJECT_MODE" in
  applescript|tty|hybrid) ;;
  *)
    echo "Invalid --probe-inject-mode: $PROBE_INJECT_MODE" >&2
    exit 1
    ;;
esac

echo "[Issue26 macOS Auto Capture]"
echo "Output dir: $OUT_DIR"
echo "Scenario: $SCENARIO"
echo "Iterations: $ITERATIONS"
echo "Stop on repro: $STOP_ON_REPRO"
echo "Expect suspected: $EXPECT_SUSPECTED"
echo "Inject modes: repro=$REPRO_INJECT_MODE probe=$PROBE_INJECT_MODE"
echo "Warmup prompt: ${WARMUP_PROMPT:-<none>}"
if [[ -n "$WAIT_FOR_SUBSTRING" ]]; then
  echo "Wait substring: $WAIT_FOR_SUBSTRING"
fi
if [[ "$ACTIVITY_GROWTH_BYTES" != "0" ]]; then
  echo "Activity growth bytes: $ACTIVITY_GROWTH_BYTES"
fi
echo
echo "Note: grant Accessibility permission for Terminal/iTerm to allow System Events key injection."
echo

for ((i = 1; i <= ITERATIONS; i += 1)); do
  RUN_DIR="${OUT_DIR}/run-${i}"
  mkdir -p "$RUN_DIR"
  SESSION_FILE="${RUN_DIR}/session.typescript"
  KEYDRIVER_LOG="${RUN_DIR}/keydriver.log"

  echo "===== Run ${i}/${ITERATIONS} ====="

  set +e
  python3 "${ROOT_DIR}/scripts/issue26-macos-keydriver.py" \
    --session-file "$SESSION_FILE" \
    --scenario "$SCENARIO" \
    --app "$APP_NAME" \
    --runner-start-timeout "$RUNNER_TIMEOUT" \
    --probe-timeout "$PROBE_TIMEOUT" \
    --initial-delay-ms "$INITIAL_DELAY_MS" \
    --step-delay-ms "$STEP_DELAY_MS" \
    --ime-text "$IME_TEXT" \
    --preedit-text "$PREEDIT_TEXT" \
    --warmup-prompt "$WARMUP_PROMPT" \
    --warmup-submit "$WARMUP_SUBMIT" \
    --wait-for-substring "$WAIT_FOR_SUBSTRING" \
    --wait-substring-timeout "$WAIT_SUBSTRING_TIMEOUT" \
    --activity-growth-bytes "$ACTIVITY_GROWTH_BYTES" \
    --activity-timeout "$ACTIVITY_TIMEOUT" \
    --runtime-wait-ms "$RUNTIME_WAIT_MS" \
    --fail-on-activate "$FAIL_ON_ACTIVATE" \
    --repro-inject-mode "$REPRO_INJECT_MODE" \
    --probe-inject-mode "$PROBE_INJECT_MODE" \
    --probe-send-retries "$PROBE_SEND_RETRIES" \
    --probe-send-delay-ms "$PROBE_SEND_DELAY_MS" \
    >"$KEYDRIVER_LOG" 2>&1 &
  KEYDRIVER_PID=$!
  set -e

  set +e
  "${ROOT_DIR}/scripts/issue26-manual-capture.sh" \
    --out-dir "$RUN_DIR" \
    --start-command "$START_COMMAND" \
    --probe-timeout "$PROBE_WINDOW"
  CAPTURE_EXIT=$?
  set -e

  set +e
  wait "$KEYDRIVER_PID"
  KEYDRIVER_EXIT=$?
  set -e

  printf '{"capture_exit":%s,"keydriver_exit":%s}\n' "$CAPTURE_EXIT" "$KEYDRIVER_EXIT" \
    > "${RUN_DIR}/run-meta.json"

  SUMMARY_JSON="${RUN_DIR}/summary.json"
  if [[ -f "$SUMMARY_JSON" ]]; then
    SUSPECTED="$(python3 - "$SUMMARY_JSON" <<'PY'
import json,sys
data = json.load(open(sys.argv[1], "r", encoding="utf-8"))
value = data.get("tty_pollution_suspected")
if value is True:
    print("yes")
elif value is False:
    print("no")
else:
    print("inconclusive")
PY
)"
    CATEGORY="$(python3 - "$SUMMARY_JSON" <<'PY'
import json,sys
data = json.load(open(sys.argv[1], "r", encoding="utf-8"))
print(data.get("suspected_category") or "n/a")
PY
)"
  else
    SUSPECTED="no-summary"
    CATEGORY="n/a"
  fi

  echo "run=${i} capture_exit=${CAPTURE_EXIT} keydriver_exit=${KEYDRIVER_EXIT} suspected=${SUSPECTED} category=${CATEGORY}"
  echo "keydriver_log=${KEYDRIVER_LOG}"
  echo

  if [[ "$STOP_ON_REPRO" == "yes" && "$SUSPECTED" == "yes" ]]; then
    echo "Reproduction captured on run ${i}; stopping early."
    break
  fi
done

python3 - "$OUT_DIR" <<'PY'
import json
import time
from pathlib import Path
import re
import sys

out_dir = Path(sys.argv[1]).resolve()
run_dirs = sorted(
    [p for p in out_dir.iterdir() if p.is_dir() and re.match(r"run-\d+$", p.name)],
    key=lambda p: int(p.name.split("-")[1]),
)

runs = []
suspected_true = 0
analysis_ok = 0
for run_dir in run_dirs:
    summary_path = run_dir / "summary.json"
    meta_path = run_dir / "run-meta.json"
    summary = {}
    meta = {}
    if summary_path.exists():
        summary = json.loads(summary_path.read_text(encoding="utf-8"))
    if meta_path.exists():
        meta = json.loads(meta_path.read_text(encoding="utf-8"))

    suspected = summary.get("tty_pollution_suspected")
    if suspected is True:
        suspected_true += 1
    if summary.get("analysis_status") == "ok":
        analysis_ok += 1

    runs.append(
        {
            "run_dir": str(run_dir),
            "capture_exit": meta.get("capture_exit"),
            "keydriver_exit": meta.get("keydriver_exit"),
            "analysis_status": summary.get("analysis_status"),
            "suspected_category": summary.get("suspected_category"),
            "tty_pollution_suspected": suspected,
            "probes": summary.get("probes"),
        }
    )

aggregate = {
    "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "out_dir": str(out_dir),
    "run_count": len(runs),
    "analysis_ok_count": analysis_ok,
    "suspected_true_count": suspected_true,
    "reproduction_rate_in_ok_runs": (
        float(suspected_true) / float(analysis_ok) if analysis_ok else None
    ),
    "runs": runs,
}

(out_dir / "aggregate.json").write_text(
    json.dumps(aggregate, ensure_ascii=False, indent=2), encoding="utf-8"
)

lines = [
    "# Issue #26 macOS Auto Capture Aggregate",
    "",
    f"- generated_at: {aggregate['generated_at']}",
    f"- out_dir: {aggregate['out_dir']}",
    f"- run_count: {aggregate['run_count']}",
    f"- analysis_ok_count: {aggregate['analysis_ok_count']}",
    f"- suspected_true_count: {aggregate['suspected_true_count']}",
    f"- reproduction_rate_in_ok_runs: {aggregate['reproduction_rate_in_ok_runs']}",
    "",
    "| Run | analysis_status | suspected | category | capture_exit | keydriver_exit |",
    "| --- | --- | --- | --- | --- | --- |",
]
for idx, run in enumerate(runs, start=1):
    lines.append(
        f"| {idx} | {run.get('analysis_status') or 'n/a'} | "
        f"{run.get('tty_pollution_suspected')} | "
        f"{run.get('suspected_category') or 'n/a'} | "
        f"{run.get('capture_exit')} | {run.get('keydriver_exit')} |"
    )
lines.append("")
(out_dir / "aggregate.md").write_text("\n".join(lines), encoding="utf-8")
PY

echo "[Issue26 macOS Auto Capture Completed]"
echo "Aggregate JSON: ${OUT_DIR}/aggregate.json"
echo "Aggregate Markdown: ${OUT_DIR}/aggregate.md"

if [[ "$EXPECT_SUSPECTED" == "any" ]]; then
  exit 0
fi

set +e
python3 - "$OUT_DIR/aggregate.json" "$EXPECT_SUSPECTED" "$REQUIRE_OK_RUNS" <<'PY'
import json
import sys
from pathlib import Path

aggregate_path = Path(sys.argv[1])
expected = sys.argv[2]
require_ok = int(sys.argv[3])

if not aggregate_path.exists():
    print("expectation_failed: aggregate.json missing")
    raise SystemExit(2)

data = json.loads(aggregate_path.read_text(encoding="utf-8"))
analysis_ok = int(data.get("analysis_ok_count") or 0)
suspected_true = int(data.get("suspected_true_count") or 0)

if analysis_ok < require_ok:
    print(
        f"expectation_failed: analysis_ok_count={analysis_ok} < required={require_ok}"
    )
    raise SystemExit(3)

if expected == "yes":
    if suspected_true > 0:
        print(f"expectation_passed: suspected_true_count={suspected_true}")
        raise SystemExit(0)
    print("expectation_failed: expected suspected reproduction, got none")
    raise SystemExit(4)

if expected == "no":
    if suspected_true == 0:
        print("expectation_passed: no suspected reproduction in ok runs")
        raise SystemExit(0)
    print(f"expectation_failed: expected clean runs, got suspected_true_count={suspected_true}")
    raise SystemExit(5)

print(f"expectation_failed: unsupported expected value {expected}")
raise SystemExit(6)
PY
ASSERT_EXIT=$?
set -e

exit "$ASSERT_EXIT"
