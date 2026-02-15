#!/usr/bin/env python3
"""
Issue #26 PTY reproduction script (Expect/PTY-style automation).

This script drives LLXPRT through a pseudo-terminal without tmux:
- sends UTF-8 Chinese input
- sends unfinished IME-like roman buffer ("nihao" without commit)
- sends Ctrl-C interrupts
- runs post-exit Enter/Tab/Ctrl-C probes in the same PTY

Usage:
  python3 scripts/issue26-pty-probe.py
  python3 scripts/issue26-pty-probe.py --scenario english_normal_exit
  python3 scripts/issue26-pty-probe.py --out-dir /tmp/issue26-pty
  python3 scripts/issue26-pty-probe.py --start-command "node scripts/start.js --yolo"
"""

from __future__ import annotations

import argparse
import json
import os
import pty
import re
import select
import signal
import sys
import tempfile
import time
from pathlib import Path


def shell_quote(text: str) -> str:
    return "'" + text.replace("'", "'\\''") + "'"


SCENARIOS = {
    "english_normal_exit": [
        {
            "type": "line",
            "text": "/profile load synthetic",
            "submit_keys": ["Escape", "Enter"],
            "wait_ms": 2500,
        },
        {"type": "line", "text": "hi", "wait_ms": 1200},
        {
            "type": "line",
            "text": "/quit",
            "submit_keys": ["Escape", "Enter"],
            "wait_ms": 1200,
        },
        {"type": "key", "key": "C-c", "wait_ms": 700},
        {"type": "key", "key": "C-c", "wait_ms": 700},
    ],
    "chinese_input_interrupt": [
        {
            "type": "line",
            "text": "/profile load synthetic",
            "submit_keys": ["Escape", "Enter"],
            "wait_ms": 2500,
        },
        {"type": "line", "text": "測試", "wait_ms": 1200},
        {"type": "text", "text": "nihao", "wait_ms": 300},
        {"type": "key", "key": "C-c", "wait_ms": 1000},
        {
            "type": "line",
            "text": "/quit",
            "submit_keys": ["Escape", "Enter"],
            "wait_ms": 1200,
        },
        {"type": "key", "key": "C-c", "wait_ms": 700},
        {"type": "key", "key": "C-c", "wait_ms": 700},
    ],
}

KEY_BYTES = {
    "Enter": b"\r",
    "Tab": b"\t",
    "Escape": b"\x1b",
    "C-c": b"\x03",
}


class PtyRunner:
    def __init__(self, fd: int) -> None:
        self.fd = fd
        self.transcript = bytearray()
        self.closed = False

    def read_once(self, timeout: float = 0.1) -> bytes:
        r, _, _ = select.select([self.fd], [], [], timeout)
        if not r:
            return b""
        try:
            chunk = os.read(self.fd, 4096)
        except OSError:
            self.closed = True
            return b""
        if chunk:
            self.transcript.extend(chunk)
        return chunk

    def read_until(self, token: bytes, timeout: float) -> bool:
        end = time.time() + timeout
        while time.time() < end:
            if token in self.transcript:
                return True
            self.read_once(0.1)
        return token in self.transcript

    def read_until_any(self, tokens: list[bytes], timeout: float) -> bytes | None:
        end = time.time() + timeout
        while time.time() < end:
            for token in tokens:
                if token in self.transcript:
                    return token
            self.read_once(0.1)
        for token in tokens:
            if token in self.transcript:
                return token
        return None

    def send_bytes(self, payload: bytes) -> bool:
        if self.closed:
            return False
        try:
            os.write(self.fd, payload)
            return True
        except OSError:
            self.closed = True
            return False

    def send_text(self, text: str) -> bool:
        return self.send_bytes(text.encode("utf-8"))

    def send_key(self, key: str) -> bool:
        payload = KEY_BYTES.get(key)
        if payload is None:
            raise ValueError(f"Unsupported key: {key}")
        return self.send_bytes(payload)


def build_runner_script(cwd: str, start_command: str) -> str:
    enter_probe = (
        "import sys,select,tty,termios;"
        "fd=sys.stdin.fileno();"
        "old=termios.tcgetattr(fd);"
        "print('__PTY_ENTER_WAIT__',flush=True);"
        "tty.setraw(fd);"
        "r,_,_=select.select([fd],[],[],2);"
        "b=(sys.stdin.buffer.read(1) if r else b'');"
        "termios.tcsetattr(fd,termios.TCSADRAIN,old);"
        "print('__PTY_ENTER_RESULT__'+(b.hex() if b else 'timeout')+'__',flush=True)"
    )
    tab_probe = (
        "import sys,select,tty,termios;"
        "fd=sys.stdin.fileno();"
        "old=termios.tcgetattr(fd);"
        "print('__PTY_TAB_WAIT__',flush=True);"
        "tty.setraw(fd);"
        "r,_,_=select.select([fd],[],[],2);"
        "b=(sys.stdin.buffer.read(1) if r else b'');"
        "termios.tcsetattr(fd,termios.TCSADRAIN,old);"
        "print('__PTY_TAB_RESULT__'+(b.hex() if b else 'timeout')+'__',flush=True)"
    )
    ctrl_probe = (
        "import time\n"
        "print('__PTY_CTRL_WAIT__',flush=True)\n"
        "try:\n"
        "    time.sleep(5)\n"
        "    print('__PTY_CTRL_DONE__',flush=True)\n"
        "except KeyboardInterrupt:\n"
        "    print('__PTY_CTRL_INTERRUPTED__',flush=True)\n"
    )

    lines = [
        "#!/usr/bin/env zsh",
        "set +e",
        f"cd {shell_quote(cwd)} || exit 1",
        "echo __PTY_READY__",
        start_command,
        "echo __PTY_CLI_EXITED__",
        f"python3 -c {shell_quote(enter_probe)}",
        f"python3 -c {shell_quote(tab_probe)}",
        f"python3 -c {shell_quote(ctrl_probe)}",
        "echo __PTY_DONE__",
    ]
    return "\n".join(lines) + "\n"


def wait_for_child_exit(pid: int, timeout: float) -> int | None:
    end = time.time() + timeout
    while time.time() < end:
        waited_pid, status = os.waitpid(pid, os.WNOHANG)
        if waited_pid == pid:
            if os.WIFEXITED(status):
                return os.WEXITSTATUS(status)
            if os.WIFSIGNALED(status):
                return 128 + os.WTERMSIG(status)
            return 1
        time.sleep(0.1)
    return None


def run_scenario(
    cwd: str,
    out_dir: Path,
    start_command: str,
    scenario_name: str,
    initial_wait_ms: int,
) -> dict:
    steps = SCENARIOS[scenario_name]
    scenario_dir = out_dir / scenario_name
    scenario_dir.mkdir(parents=True, exist_ok=True)

    script_content = build_runner_script(cwd, start_command)
    script_path = scenario_dir / "runner.zsh"
    script_path.write_text(script_content, encoding="utf-8")
    os.chmod(script_path, 0o755)

    pid, fd = pty.fork()
    if pid == 0:
        os.execvp("/bin/zsh", ["/bin/zsh", str(script_path)])
        raise RuntimeError("execvp failed")

    runner = PtyRunner(fd)
    started_at = time.time()
    errors: list[str] = []

    try:
        if not runner.read_until(b"__PTY_READY__", timeout=8):
            errors.append("timeout waiting for __PTY_READY__")

        time.sleep(max(0, initial_wait_ms) / 1000.0)

        for step in steps:
            step_type = step.get("type")
            if step_type == "line":
                if not runner.send_text(step["text"]):
                    errors.append("failed to send line text (PTY closed)")
                    break
                submit_keys = step.get("submit_keys") or ["Enter"]
                for submit_key in submit_keys:
                    if not runner.send_key(submit_key):
                        errors.append(
                            f"failed to send {submit_key} for line step (PTY closed)"
                        )
                        break
                if runner.closed:
                    break
            elif step_type == "text":
                if not runner.send_text(step["text"]):
                    errors.append("failed to send text step (PTY closed)")
                    break
            elif step_type == "key":
                if not runner.send_key(step["key"]):
                    errors.append(f"failed to send key {step['key']} (PTY closed)")
                    break
            elif step_type == "wait":
                pass
            else:
                errors.append(f"unknown step type: {step_type}")
            time.sleep(max(0, int(step.get("wait_ms", 0))) / 1000.0)
            runner.read_once(0.05)

        if not runner.read_until(b"__PTY_CLI_EXITED__", timeout=80):
            errors.append("timeout waiting for __PTY_CLI_EXITED__")

        if not runner.read_until(b"__PTY_ENTER_WAIT__", timeout=6):
            errors.append("timeout waiting for __PTY_ENTER_WAIT__")
        if not runner.send_key("Enter"):
            errors.append("failed to send Enter probe key (PTY closed)")
        if not runner.read_until(b"__PTY_ENTER_RESULT__", timeout=6):
            errors.append("timeout waiting for __PTY_ENTER_RESULT__")

        if not runner.read_until(b"__PTY_TAB_WAIT__", timeout=6):
            errors.append("timeout waiting for __PTY_TAB_WAIT__")
        if not runner.send_key("Tab"):
            errors.append("failed to send Tab probe key (PTY closed)")
        if not runner.read_until(b"__PTY_TAB_RESULT__", timeout=6):
            errors.append("timeout waiting for __PTY_TAB_RESULT__")

        if not runner.read_until(b"__PTY_CTRL_WAIT__", timeout=6):
            errors.append("timeout waiting for __PTY_CTRL_WAIT__")
        if not runner.send_key("C-c"):
            errors.append("failed to send Ctrl-C probe key (PTY closed)")
        if not runner.read_until_any(
            [b"__PTY_CTRL_DONE__", b"__PTY_CTRL_INTERRUPTED__", b"__PTY_DONE__"],
            timeout=8,
        ):
            errors.append(
                "timeout waiting for __PTY_CTRL_DONE__ / __PTY_CTRL_INTERRUPTED__ / __PTY_DONE__"
            )
        # __PTY_DONE__ may be skipped if the PTY shell itself is interrupted
        # by Ctrl-C after the probe marker has already been emitted.
        runner.read_until(b"__PTY_DONE__", timeout=2)

        # Drain remaining output quickly
        for _ in range(10):
            if not runner.read_once(0.05):
                break
    finally:
        exit_code = wait_for_child_exit(pid, timeout=5)
        if exit_code is None:
            try:
                os.kill(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            exit_code = wait_for_child_exit(pid, timeout=2)
            if exit_code is None:
                exit_code = 137

    transcript_bytes = bytes(runner.transcript)
    transcript_text = transcript_bytes.decode("utf-8", errors="replace")
    (scenario_dir / "transcript.bin").write_bytes(transcript_bytes)
    (scenario_dir / "transcript.txt").write_text(transcript_text, encoding="utf-8")

    enter_match = re.search(r"__PTY_ENTER_RESULT__([0-9a-f]+|timeout)__", transcript_text)
    tab_match = re.search(r"__PTY_TAB_RESULT__([0-9a-f]+|timeout)__", transcript_text)
    ctrl_done_seen = "__PTY_CTRL_DONE__" in transcript_text
    ctrl_interrupted_seen = "__PTY_CTRL_INTERRUPTED__" in transcript_text
    ctrl_interrupted = ctrl_interrupted_seen and not ctrl_done_seen

    raw_leak_detected = any(x in transcript_text for x in ["^[[A", "^[[B", "^[[C", "^[[D"])

    duration_ms = int((time.time() - started_at) * 1000)
    result = {
        "scenario": scenario_name,
        "status": "ok" if not errors else "error",
        "errors": errors,
        "duration_ms": duration_ms,
        "exit_code": exit_code,
        "artifacts_dir": str(scenario_dir),
        "probes": {
            "enter_value": enter_match.group(1).lower() if enter_match else None,
            "tab_value": tab_match.group(1).lower() if tab_match else None,
            "ctrl_interrupted": ctrl_interrupted,
            "raw_leak_detected": raw_leak_detected,
        },
    }
    (scenario_dir / "summary.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Issue #26 PTY reproduction runner")
    parser.add_argument(
        "--scenario",
        choices=["english_normal_exit", "chinese_input_interrupt", "all"],
        default="chinese_input_interrupt",
        help="Scenario to run",
    )
    parser.add_argument(
        "--out-dir",
        default="",
        help="Output directory for artifacts (default: temp dir)",
    )
    parser.add_argument(
        "--initial-wait-ms",
        type=int,
        default=5000,
        help="Wait time before sending scenario keystrokes",
    )
    parser.add_argument(
        "--start-command",
        default="node scripts/start.js --yolo",
        help="Command used to launch LLXPRT in the PTY",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    cwd = os.getcwd()

    if args.out_dir:
        out_dir = Path(args.out_dir).resolve()
        out_dir.mkdir(parents=True, exist_ok=True)
    else:
        out_dir = Path(tempfile.mkdtemp(prefix="llxprt-issue26-pty-"))

    scenarios = (
        list(SCENARIOS.keys())
        if args.scenario == "all"
        else [args.scenario]
    )

    results = []
    for scenario_name in scenarios:
        result = run_scenario(
            cwd=cwd,
            out_dir=out_dir,
            start_command=args.start_command,
            scenario_name=scenario_name,
            initial_wait_ms=args.initial_wait_ms,
        )
        results.append(result)

    report = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "cwd": cwd,
        "start_command": args.start_command,
        "out_dir": str(out_dir),
        "results": results,
    }
    (out_dir / "report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print("Issue #26 PTY probe finished.")
    print(f"Artifacts: {out_dir}")
    print(f"JSON report: {out_dir / 'report.json'}")

    has_error = any(item.get("status") != "ok" for item in results)
    return 1 if has_error else 0


if __name__ == "__main__":
    raise SystemExit(main())
