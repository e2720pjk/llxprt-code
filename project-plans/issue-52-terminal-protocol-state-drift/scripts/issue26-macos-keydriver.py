#!/usr/bin/env python3
"""
macOS key-event driver for Issue #26 reproduction.

This script watches the manual-capture session transcript markers and injects
real key events via System Events (osascript), so capture can run without
manual key presses.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import time
from pathlib import Path


def log(msg: str) -> None:
    print(f"[issue26-keydriver] {msg}", flush=True)


PROBE_VALUE_PATTERNS = {
    "ENTER": re.compile(r"__ISSUE26_ENTER_PROBE__([0-9a-f]+|timeout)__", re.IGNORECASE),
    "TAB": re.compile(r"__ISSUE26_TAB_PROBE__([0-9a-f]+|timeout)__", re.IGNORECASE),
}


def run_osascript(lines: list[str]) -> None:
    cmd: list[str] = ["osascript"]
    for line in lines:
        cmd.extend(["-e", line])
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        stderr = result.stderr.strip()
        raise RuntimeError(stderr or "osascript failed")


def escape_applescript_text(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def detect_frontmost_process() -> str:
    cmd = [
        "osascript",
        "-e",
        'tell application "System Events" to get name of first process whose frontmost is true',
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        return ""
    return result.stdout.strip()


def resolve_app_name(app: str) -> str:
    if app != "auto":
        return app

    detected = detect_frontmost_process()
    if detected:
        return detected
    return "Terminal"


def activate_app(app_name: str) -> None:
    run_osascript(
        [
            f'tell application "{escape_applescript_text(app_name)}" to activate',
            "delay 0.15",
        ]
    )


def key_text(text: str) -> None:
    escaped = escape_applescript_text(text)
    run_osascript(
        [
            'tell application "System Events"',
            f'  keystroke "{escaped}"',
            "end tell",
        ]
    )


def key_return() -> None:
    run_osascript(
        [
            'tell application "System Events"',
            "  key code 36",
            "end tell",
        ]
    )


def key_tab() -> None:
    run_osascript(
        [
            'tell application "System Events"',
            "  key code 48",
            "end tell",
        ]
    )


def key_ctrl_c() -> None:
    run_osascript(
        [
            'tell application "System Events"',
            "  key code 8 using control down",
            "end tell",
        ]
    )


def read_text(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8", errors="replace")


def resolve_tty_path_from_meta(session_file: Path) -> str | None:
    meta_file = session_file.parent / "meta.txt"
    if not meta_file.exists():
        return None
    for line in read_text(meta_file).splitlines():
        if not line.startswith("tty="):
            continue
        value = line[len("tty="):].strip()
        if value.startswith("/dev/"):
            return value
    return None


def resolve_tty_path_from_protocol_snapshot(session_file: Path) -> str | None:
    snapshot_file = session_file.parent / "protocol.before.json"
    if not snapshot_file.exists():
        return None
    try:
        data = json.loads(snapshot_file.read_text(encoding="utf-8", errors="replace"))
    except Exception:
        return None
    tty_value = data.get("tty")
    if isinstance(tty_value, str) and tty_value.startswith("/dev/"):
        return tty_value
    return None


def resolve_preferred_tty_path(session_file: Path) -> str | None:
    # Prefer the probe/session pty captured by protocol snapshot. The meta tty
    # is the outer shell tty and can differ from the script(1) pseudo-tty.
    return resolve_tty_path_from_protocol_snapshot(session_file) or resolve_tty_path_from_meta(session_file)


def extract_probe_value(session_file: Path, probe_name: str) -> str | None:
    pattern = PROBE_VALUE_PATTERNS.get(probe_name)
    if pattern is None:
        return None
    match = pattern.search(read_text(session_file))
    return match.group(1).lower() if match else None


def write_tty_bytes(tty_path: str, payload: bytes) -> None:
    fd = os.open(tty_path, os.O_WRONLY | os.O_NONBLOCK)
    try:
        os.write(fd, payload)
    finally:
        os.close(fd)


def send_text_event(text: str, mode: str, tty_path: str | None) -> str:
    errors: list[str] = []
    if mode in ("tty", "hybrid"):
        if tty_path:
            try:
                write_tty_bytes(tty_path, text.encode("utf-8"))
                return "tty"
            except Exception as exc:
                errors.append(f"tty text failed: {exc}")
        else:
            errors.append("tty path unavailable")
        if mode == "tty":
            raise RuntimeError("; ".join(errors))
    if mode in ("applescript", "hybrid"):
        try:
            key_text(text)
            return "applescript"
        except Exception as exc:
            errors.append(f"applescript text failed: {exc}")
    raise RuntimeError("; ".join(errors) or "unable to send text")


def send_key_event(key_name: str, mode: str, tty_path: str | None) -> str:
    tty_payload: bytes | None = None
    applescript_sender = None
    if key_name == "ENTER":
        tty_payload = b"\r"
        applescript_sender = key_return
    elif key_name == "TAB":
        tty_payload = b"\t"
        applescript_sender = key_tab
    elif key_name == "CTRL_C":
        tty_payload = b"\x03"
        applescript_sender = key_ctrl_c
    else:
        raise ValueError(f"Unsupported key_name: {key_name}")

    errors: list[str] = []
    if mode in ("tty", "hybrid"):
        if tty_path:
            try:
                write_tty_bytes(tty_path, tty_payload)
                return "tty"
            except Exception as exc:
                errors.append(f"tty key failed: {exc}")
        else:
            errors.append("tty path unavailable")
        if mode == "tty":
            raise RuntimeError("; ".join(errors))
    if mode in ("applescript", "hybrid"):
        try:
            applescript_sender()
            return "applescript"
        except Exception as exc:
            errors.append(f"applescript key failed: {exc}")
    raise RuntimeError("; ".join(errors) or "unable to send key event")


def wait_for_marker(
    session_file: Path,
    marker: str,
    timeout_seconds: float,
    poll_interval_seconds: float = 0.2,
) -> bool:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if session_file.exists():
            text = session_file.read_text(encoding="utf-8", errors="replace")
            if marker in text:
                return True
        time.sleep(poll_interval_seconds)
    return False


def wait_for_substring(
    session_file: Path,
    substring: str,
    timeout_seconds: float,
    poll_interval_seconds: float = 0.25,
) -> bool:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if session_file.exists():
            text = session_file.read_text(encoding="utf-8", errors="replace")
            if substring in text:
                return True
        time.sleep(poll_interval_seconds)
    return False


def wait_for_growth(
    session_file: Path,
    baseline_size: int,
    min_growth_bytes: int,
    timeout_seconds: float,
    poll_interval_seconds: float = 0.25,
) -> bool:
    target_size = baseline_size + min_growth_bytes
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if session_file.exists():
            current_size = session_file.stat().st_size
            if current_size >= target_size:
                return True
        time.sleep(poll_interval_seconds)
    return False


def execute_repro_sequence(
    scenario: str,
    ime_text: str,
    preedit_text: str,
    quit_command: str,
    step_delay: float,
    inject_mode: str,
    tty_path: str | None,
) -> None:
    if scenario == "english_quit":
        send_text_event("hello", inject_mode, tty_path)
        time.sleep(step_delay)
        send_text_event(quit_command, inject_mode, tty_path)
        time.sleep(step_delay)
        send_key_event("ENTER", inject_mode, tty_path)
        return

    if scenario == "ime_quit_only":
        send_text_event(preedit_text, inject_mode, tty_path)
        time.sleep(step_delay)
        send_text_event(ime_text, inject_mode, tty_path)
        time.sleep(step_delay)
        send_text_event(quit_command, inject_mode, tty_path)
        time.sleep(step_delay)
        send_key_event("ENTER", inject_mode, tty_path)
        return

    if scenario == "ime_interrupt_then_quit":
        send_text_event(preedit_text, inject_mode, tty_path)
        time.sleep(step_delay)
        send_text_event(ime_text, inject_mode, tty_path)
        time.sleep(step_delay)
        send_key_event("CTRL_C", inject_mode, tty_path)
        time.sleep(step_delay)
        send_text_event(quit_command, inject_mode, tty_path)
        time.sleep(step_delay)
        send_key_event("ENTER", inject_mode, tty_path)
        return

    raise ValueError(f"Unsupported scenario: {scenario}")


def send_probe_with_confirmation(
    session_file: Path,
    probe_name: str,
    key_name: str,
    desc: str,
    inject_mode: str,
    tty_path: str | None,
    retries: int,
    delay_seconds: float,
) -> None:
    if probe_name not in PROBE_VALUE_PATTERNS:
        backend = send_key_event(key_name, inject_mode, tty_path)
        log(f"sent {desc} via {backend}")
        return

    attempts = max(1, retries)
    confirm_window = max(1.0, delay_seconds * 6)

    if inject_mode == "hybrid":
        if tty_path:
            backend_order = ["tty", "applescript"]
        else:
            backend_order = ["applescript"]
    else:
        backend_order = [inject_mode]

    # Do not flood probe windows with repeated Enter/Tab sends. Multiple queued
    # Enter bytes can be consumed by the next probe and cause false positives.
    max_sends = min(attempts, len(backend_order))
    for attempt in range(1, max_sends + 1):
        existing = extract_probe_value(session_file, probe_name)
        if existing is not None:
            log(f"{desc} marker already present: {existing}")
            return

        attempt_mode = backend_order[attempt - 1]
        try:
            backend = send_key_event(key_name, attempt_mode, tty_path)
        except Exception as exc:
            if inject_mode == "hybrid" and attempt_mode == "tty":
                backend = send_key_event(key_name, "applescript", tty_path)
                log(f"{desc} tty send failed ({exc}); fell back to applescript")
            else:
                raise

        log(f"sent {desc} via {backend} (attempt {attempt}/{max_sends})")
        deadline = time.monotonic() + confirm_window
        while time.monotonic() < deadline:
            observed = extract_probe_value(session_file, probe_name)
            if observed is not None:
                log(f"{desc} observed probe value: {observed}")
                return
            time.sleep(0.03)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Issue26 macOS key-event driver")
    parser.add_argument("--session-file", required=True, help="Path to session.typescript")
    parser.add_argument(
        "--scenario",
        default="ime_interrupt_then_quit",
        choices=["english_quit", "ime_quit_only", "ime_interrupt_then_quit"],
        help="Reproduction scenario to inject",
    )
    parser.add_argument(
        "--app",
        default="auto",
        help='Target app name for activation (default: auto -> frontmost process, fallback "Terminal")',
    )
    parser.add_argument(
        "--runner-start-timeout",
        type=float,
        default=60.0,
        help="Seconds to wait for __ISSUE26_RUNNER_START__",
    )
    parser.add_argument(
        "--probe-timeout",
        type=float,
        default=120.0,
        help="Seconds to wait for each probe marker",
    )
    parser.add_argument(
        "--initial-delay-ms",
        type=int,
        default=6000,
        help="Delay before injecting reproduction sequence after runner start",
    )
    parser.add_argument(
        "--step-delay-ms",
        type=int,
        default=350,
        help="Delay between key events",
    )
    parser.add_argument(
        "--ime-text",
        default="測試",
        help="IME text payload",
    )
    parser.add_argument(
        "--preedit-text",
        default="nihao",
        help="Preedit payload before conversion",
    )
    parser.add_argument(
        "--quit-command",
        default="/quit",
        help="Quit command to send inside TUI",
    )
    parser.add_argument(
        "--warmup-prompt",
        default="",
        help="Optional prompt to submit before reproduction trigger",
    )
    parser.add_argument(
        "--warmup-submit",
        default="yes",
        choices=["yes", "no"],
        help="Press Enter after warmup prompt (default: yes)",
    )
    parser.add_argument(
        "--wait-for-substring",
        default="",
        help="Optional substring to wait for in transcript before triggering reproduction",
    )
    parser.add_argument(
        "--wait-substring-timeout",
        type=float,
        default=120.0,
        help="Timeout for --wait-for-substring",
    )
    parser.add_argument(
        "--activity-growth-bytes",
        type=int,
        default=0,
        help="Wait for transcript size growth (bytes) before triggering reproduction",
    )
    parser.add_argument(
        "--activity-timeout",
        type=float,
        default=120.0,
        help="Timeout for --activity-growth-bytes",
    )
    parser.add_argument(
        "--runtime-wait-ms",
        type=int,
        default=0,
        help="Extra wait before reproduction after warmup/activity conditions",
    )
    parser.add_argument(
        "--fail-on-activate",
        default="no",
        choices=["yes", "no"],
        help="Return non-zero if app activation fails (default: no)",
    )
    parser.add_argument(
        "--repro-inject-mode",
        default="applescript",
        choices=["applescript", "tty", "hybrid"],
        help="Input backend for warmup and reproduction sequence (default: applescript)",
    )
    parser.add_argument(
        "--probe-inject-mode",
        default="hybrid",
        choices=["applescript", "tty", "hybrid"],
        help="Input backend for Enter/Tab/Ctrl-C probes (default: hybrid)",
    )
    parser.add_argument(
        "--probe-send-retries",
        type=int,
        default=2,
        help="How many sends to try per probe before moving on (default: 2)",
    )
    parser.add_argument(
        "--probe-send-delay-ms",
        type=int,
        default=220,
        help="Delay between probe send attempts (default: 220)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    session_file = Path(args.session_file).resolve()
    initial_delay = max(0.0, args.initial_delay_ms / 1000.0)
    step_delay = max(0.0, args.step_delay_ms / 1000.0)
    runtime_wait = max(0.0, args.runtime_wait_ms / 1000.0)
    probe_send_delay = max(0.01, args.probe_send_delay_ms / 1000.0)

    log(f"session_file={session_file}")
    log(f"scenario={args.scenario}")
    tty_path = resolve_preferred_tty_path(session_file)
    log(f"tty_path={tty_path or 'n/a'}")
    log(
        f"inject_modes repro={args.repro_inject_mode} probe={args.probe_inject_mode}"
    )

    if not wait_for_marker(
        session_file, "__ISSUE26_RUNNER_START__", args.runner_start_timeout
    ):
        log("timeout waiting for runner start marker")
        return 10

    # protocol.before.json contains the actual script(1) pseudo-tty.
    # Re-resolve tty path after the runner has started and snapshot is likely ready.
    wait_for_marker(session_file, "__ISSUE26_PROTOCOL_BEFORE_DONE__", 15.0)
    tty_path = resolve_preferred_tty_path(session_file)
    log(f"resolved tty_path(after protocol snapshot)={tty_path or 'n/a'}")

    app_name = resolve_app_name(args.app)
    log(f"target_app={app_name}")
    needs_activate = args.repro_inject_mode in {"applescript", "hybrid"} or args.probe_inject_mode in {"applescript", "hybrid"}
    if needs_activate:
        try:
            activate_app(app_name)
        except Exception as exc:
            log(f"failed to activate app: {exc}")
            if args.fail_on_activate == "yes":
                return 20
            log("continuing without activate")

    time.sleep(initial_delay)

    if args.warmup_prompt:
        try:
            backend = send_text_event(
                args.warmup_prompt, args.repro_inject_mode, tty_path
            )
            log(f"warmup prompt sent via {backend}")
            if args.warmup_submit == "yes":
                time.sleep(step_delay)
                backend = send_key_event("ENTER", args.repro_inject_mode, tty_path)
                log(f"warmup submit sent via {backend}")
        except Exception as exc:
            log(f"failed during warmup prompt: {exc}")
            return 25

    if args.wait_for_substring:
        log(f"waiting substring: {args.wait_for_substring}")
        if not wait_for_substring(
            session_file=session_file,
            substring=args.wait_for_substring,
            timeout_seconds=args.wait_substring_timeout,
        ):
            log("timeout waiting for wait-for-substring condition")
            return 26

    if args.activity_growth_bytes > 0:
        baseline_size = session_file.stat().st_size if session_file.exists() else 0
        log(
            f"waiting transcript growth: +{args.activity_growth_bytes} bytes "
            f"(baseline={baseline_size})"
        )
        if not wait_for_growth(
            session_file=session_file,
            baseline_size=baseline_size,
            min_growth_bytes=args.activity_growth_bytes,
            timeout_seconds=args.activity_timeout,
        ):
            log("timeout waiting for transcript growth condition")
            return 27

    if runtime_wait > 0:
        log(f"runtime wait before reproduction: {runtime_wait:.2f}s")
        time.sleep(runtime_wait)

    try:
        execute_repro_sequence(
            scenario=args.scenario,
            ime_text=args.ime_text,
            preedit_text=args.preedit_text,
            quit_command=args.quit_command,
            step_delay=step_delay,
            inject_mode=args.repro_inject_mode,
            tty_path=tty_path,
        )
    except Exception as exc:
        log(f"failed during repro sequence: {exc}")
        return 30

    marker_steps = [
        ("ENTER", "__ISSUE26_ENTER_WAIT__", "ENTER", "Enter probe"),
        ("TAB", "__ISSUE26_TAB_WAIT__", "TAB", "Tab probe"),
        ("CTRL", "__ISSUE26_CTRL_WAIT__", "CTRL_C", "Ctrl-C probe"),
    ]

    for probe_name, marker, key_name, desc in marker_steps:
        if not wait_for_marker(session_file, marker, args.probe_timeout):
            log(f"timeout waiting for marker: {marker}")
            return 40
        try:
            send_probe_with_confirmation(
                session_file=session_file,
                probe_name=probe_name,
                key_name=key_name,
                desc=desc,
                inject_mode=args.probe_inject_mode,
                tty_path=tty_path,
                retries=args.probe_send_retries,
                delay_seconds=probe_send_delay,
            )
        except Exception as exc:
            log(f"failed to send {desc}: {exc}")
            return 50

    if not wait_for_marker(session_file, "__ISSUE26_RUNNER_DONE__", args.probe_timeout):
        log("runner done marker not seen before timeout")
        return 60

    log("completed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
