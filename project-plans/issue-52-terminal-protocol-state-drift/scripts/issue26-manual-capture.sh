#!/usr/bin/env bash

# Manual-capture harness for Issue #26.
# This is designed for real terminal + real IME reproduction.
#
# Usage:
#   scripts/issue26-manual-capture.sh
#   scripts/issue26-manual-capture.sh --out-dir /tmp/issue26-manual
#   scripts/issue26-manual-capture.sh --start-command "node scripts/start.js --yolo"

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/issue26-manual-capture.sh [options]

Options:
  --out-dir <dir>        Output directory (default: /tmp/issue26-manual-<timestamp>)
  --start-command <cmd>  Command to launch LLXPRT (default: node scripts/start.js --yolo)
  --probe-timeout <sec>  Seconds for each probe window (default: 10)
  -h, --help             Show help

This script records:
  - stty before/after
  - terminal protocol snapshots (DECRQM + kitty query)
  - full terminal transcript (session.typescript)
  - key probes after CLI exit (Enter / Tab / Ctrl-C)
  - summary.json + summary.md
EOF
}

OUT_DIR=""
START_COMMAND="node scripts/start.js --yolo"
PROBE_TIMEOUT="10"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out-dir)
      [[ $# -ge 2 ]] || {
        echo "Missing value for --out-dir" >&2
        exit 1
      }
      OUT_DIR="$2"
      shift 2
      ;;
    --start-command)
      [[ $# -ge 2 ]] || {
        echo "Missing value for --start-command" >&2
        exit 1
      }
      START_COMMAND="$2"
      shift 2
      ;;
    --probe-timeout)
      [[ $# -ge 2 ]] || {
        echo "Missing value for --probe-timeout" >&2
        exit 1
      }
      PROBE_TIMEOUT="$2"
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

if ! command -v script >/dev/null 2>&1; then
  echo "Missing required command: script" >&2
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "Missing required command: python3" >&2
  exit 1
fi

if [[ -z "${OUT_DIR}" ]]; then
  OUT_DIR="/tmp/issue26-manual-$(date +%Y%m%d-%H%M%S)"
fi
OUT_DIR="$(cd "$(dirname "$OUT_DIR")" && pwd)/$(basename "$OUT_DIR")"
mkdir -p "$OUT_DIR"

ROOT_DIR="$(pwd)"
SESSION_FILE="${OUT_DIR}/session.typescript"
RUNNER_FILE="${OUT_DIR}/runner.sh"
META_FILE="${OUT_DIR}/meta.txt"

{
  echo "generated_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "root_dir=${ROOT_DIR}"
  echo "start_command=${START_COMMAND}"
  echo "probe_timeout=${PROBE_TIMEOUT}"
  echo "shell=${SHELL:-unknown}"
  echo "term=${TERM:-unknown}"
  echo "lang=${LANG:-unknown}"
  echo "tty=$(tty || true)"
} > "$META_FILE"

stty -a > "${OUT_DIR}/stty.before.txt"

cat > "$RUNNER_FILE" <<'EOF'
#!/usr/bin/env bash
set +e

SNAPSHOT_SCRIPT="${ISSUE26_ROOT_DIR}/scripts/issue26-terminal-protocol-snapshot.py"

echo "__ISSUE26_RUNNER_START__"
echo "__ISSUE26_START_COMMAND__${ISSUE26_START_COMMAND}__"

if [[ -f "${SNAPSHOT_SCRIPT}" ]]; then
  python3 "${SNAPSHOT_SCRIPT}" --output "${ISSUE26_OUT_DIR}/protocol.before.json" --tag before --quiet
  if [[ $? -eq 0 ]]; then
    echo "__ISSUE26_PROTOCOL_BEFORE_DONE__"
  else
    echo "__ISSUE26_PROTOCOL_BEFORE_FAILED__"
  fi
fi

eval "${ISSUE26_START_COMMAND}"
CLI_EXIT_CODE=$?

echo "__ISSUE26_CLI_EXIT_CODE__${CLI_EXIT_CODE}__"
stty -a > "${ISSUE26_OUT_DIR}/stty.after.txt"
echo "__ISSUE26_STTY_AFTER_DONE__"
if [[ -f "${SNAPSHOT_SCRIPT}" ]]; then
  python3 "${SNAPSHOT_SCRIPT}" --output "${ISSUE26_OUT_DIR}/protocol.after.json" --tag after --quiet
  if [[ $? -eq 0 ]]; then
    echo "__ISSUE26_PROTOCOL_AFTER_DONE__"
  else
    echo "__ISSUE26_PROTOCOL_AFTER_FAILED__"
  fi
fi

PROBE_FILE="${ISSUE26_OUT_DIR}/manual-probe.py"
cat > "${PROBE_FILE}" <<'PY'
import select
import sys
import termios
import time
import tty

def drain_pending(fd: int) -> None:
    while True:
        r, _, _ = select.select([fd], [], [], 0)
        if not r:
            return
        chunk = sys.stdin.buffer.read(1)
        if not chunk:
            return

def probe(name: str, timeout: float) -> None:
    fd = sys.stdin.fileno()
    old = termios.tcgetattr(fd)
    print(f"__ISSUE26_{name}_WAIT__", flush=True)
    tty.setraw(fd)
    # Discard stale buffered input from previous probe windows so each probe
    # captures a fresh key event.
    drain_pending(fd)
    r, _, _ = select.select([fd], [], [], timeout)
    data = sys.stdin.buffer.read(1) if r else b""
    termios.tcsetattr(fd, termios.TCSADRAIN, old)
    value = data.hex() if data else "timeout"
    print(f"__ISSUE26_{name}_PROBE__{value}__", flush=True)

timeout = float(sys.argv[1]) if len(sys.argv) > 1 else 10.0

print("Manual probes start now. Press Enter, then Tab, then Ctrl-C when prompted.", flush=True)
probe("ENTER", timeout)
probe("TAB", timeout)
print("__ISSUE26_CTRL_WAIT__", flush=True)
try:
    time.sleep(timeout)
    print("__ISSUE26_CTRL_DONE__", flush=True)
except KeyboardInterrupt:
    print("__ISSUE26_CTRL_INTERRUPTED__", flush=True)
PY
python3 "${PROBE_FILE}" "${ISSUE26_PROBE_TIMEOUT:-10}"

echo "__ISSUE26_RUNNER_DONE__"
exit "${CLI_EXIT_CODE}"
EOF
chmod +x "$RUNNER_FILE"

cat <<EOF
[Issue26 Manual Capture]
Output dir: ${OUT_DIR}

1) Script will now start a recorded shell and run:
   ${START_COMMAND}
2) Reproduce your REAL problem exactly (with your Chinese IME).
3) Exit LLXPRT when done.
4) After exit, follow probe prompts:
   - press Enter once
   - press Tab once
   - press Ctrl-C once
5) Wait for summary files.
EOF

set +e
ISSUE26_ROOT_DIR="$ROOT_DIR" ISSUE26_OUT_DIR="$OUT_DIR" ISSUE26_START_COMMAND="$START_COMMAND" ISSUE26_PROBE_TIMEOUT="$PROBE_TIMEOUT" script -q "$SESSION_FILE" "$RUNNER_FILE"
RUNNER_EXIT=$?
set -e

python3 "${ROOT_DIR}/scripts/issue26-manual-analyze.py" --out-dir "$OUT_DIR" --runner-exit "$RUNNER_EXIT"

echo
echo "[Issue26 Manual Capture Completed]"
echo "Artifacts: ${OUT_DIR}"
echo "Transcript: ${SESSION_FILE}"
echo "Summary: ${OUT_DIR}/summary.md"
