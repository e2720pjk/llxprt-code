#!/usr/bin/env python3
"""
Capture terminal protocol state snapshots for Issue #26.

This script queries terminal private modes using DECRQM and records the
responses. It also queries kitty keyboard protocol state when supported.
"""

from __future__ import annotations

import argparse
import fcntl
import json
import os
import re
import select
import sys
import termios
import time
import tty
from pathlib import Path

DEFAULT_MODES = [
    1000,
    1002,
    1003,
    1004,
    1005,
    1006,
    1015,
    1016,
    1049,
    2004,
    2026,
]

DECRPM_STATE_LABEL = {
    0: "not_recognized",
    1: "set",
    2: "reset",
    3: "permanently_set",
    4: "permanently_reset",
}

DECRPM_RE = re.compile(rb"\x1b\[\?(\d+);(\d+)\$y")
KITTY_RE = re.compile(rb"\x1b\[\?([0-9:;]+)u")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Capture terminal protocol snapshot")
    parser.add_argument("--output", required=True, help="JSON output path")
    parser.add_argument("--tag", default="snapshot", help="Snapshot tag")
    parser.add_argument(
        "--per-query-timeout-ms",
        type=int,
        default=120,
        help="Milliseconds to wait for each query response",
    )
    parser.add_argument(
        "--kitty-timeout-ms",
        type=int,
        default=120,
        help="Milliseconds to wait for kitty keyboard query response",
    )
    parser.add_argument(
        "--modes",
        default=",".join(str(m) for m in DEFAULT_MODES),
        help="Comma-separated DEC private modes to query",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Do not print output path to stdout",
    )
    return parser.parse_args()


def parse_mode_list(raw: str) -> list[int]:
    modes: list[int] = []
    for token in raw.split(","):
        value = token.strip()
        if not value:
            continue
        modes.append(int(value))
    return modes


def read_available(fd: int, timeout_ms: int) -> bytes:
    chunks: list[bytes] = []
    deadline = time.monotonic() + (timeout_ms / 1000.0)
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        r, _, _ = select.select([fd], [], [], min(remaining, 0.02))
        if not r:
            continue
        try:
            data = os.read(fd, 4096)
        except BlockingIOError:
            continue
        if not data:
            break
        chunks.append(data)
    return b"".join(chunks)


def flush_pending_input(fd: int) -> None:
    for _ in range(8):
        try:
            data = os.read(fd, 4096)
        except BlockingIOError:
            break
        if not data:
            break


def send_sequence(write_fd: int, seq: bytes) -> None:
    view = memoryview(seq)
    offset = 0
    while offset < len(seq):
        try:
            written = os.write(write_fd, view[offset:])
        except BlockingIOError:
            continue
        offset += written


def parse_decrqm_responses(raw: bytes) -> dict[str, dict]:
    by_mode: dict[str, dict] = {}
    for mode_b, value_b in DECRPM_RE.findall(raw):
        mode = mode_b.decode("ascii", errors="replace")
        value = int(value_b.decode("ascii", errors="replace"))
        by_mode[mode] = {
            "value": value,
            "state": DECRPM_STATE_LABEL.get(value, "unknown"),
        }
    return by_mode


def parse_kitty_response(raw: bytes) -> dict:
    values = [m.decode("ascii", errors="replace") for m in KITTY_RE.findall(raw)]
    return {
        "responses": values,
        "current": values[-1] if values else None,
    }


def capture_snapshot(
    modes: list[int],
    per_query_timeout_ms: int,
    kitty_timeout_ms: int,
) -> dict:
    read_fd = sys.stdin.fileno()
    write_fd = sys.stdout.fileno()
    if not os.isatty(read_fd):
        raise RuntimeError("stdin is not a tty")
    if not os.isatty(write_fd):
        raise RuntimeError("stdout is not a tty")

    old_term = termios.tcgetattr(read_fd)
    old_flags = fcntl.fcntl(read_fd, fcntl.F_GETFL)

    raw_chunks: list[bytes] = []
    decrqm_chunks: list[bytes] = []
    kitty_chunks: list[bytes] = []

    try:
        tty.setraw(read_fd)
        fcntl.fcntl(read_fd, fcntl.F_SETFL, old_flags | os.O_NONBLOCK)
        flush_pending_input(read_fd)

        for mode in modes:
            query = f"\x1b[?{mode}$p".encode("ascii")
            send_sequence(write_fd, query)
            chunk = read_available(read_fd, per_query_timeout_ms)
            if chunk:
                decrqm_chunks.append(chunk)
                raw_chunks.append(chunk)

        send_sequence(write_fd, b"\x1b[?u")
        kitty_chunk = read_available(read_fd, kitty_timeout_ms)
        if kitty_chunk:
            kitty_chunks.append(kitty_chunk)
            raw_chunks.append(kitty_chunk)
    finally:
        termios.tcsetattr(read_fd, termios.TCSADRAIN, old_term)
        fcntl.fcntl(read_fd, fcntl.F_SETFL, old_flags)

    decrqm_raw = b"".join(decrqm_chunks)
    kitty_raw = b"".join(kitty_chunks)
    all_raw = b"".join(raw_chunks)

    by_mode = parse_decrqm_responses(decrqm_raw)
    kitty = parse_kitty_response(kitty_raw)

    return {
        "tty": os.ttyname(read_fd),
        "term": os.environ.get("TERM", ""),
        "decrqm": {
            "requested_modes": modes,
            "by_mode": by_mode,
            "response_count": len(by_mode),
            "raw_hex": decrqm_raw.hex(),
        },
        "kitty_keyboard": {
            **kitty,
            "raw_hex": kitty_raw.hex(),
        },
        "raw_response_hex": all_raw.hex(),
    }


def main() -> int:
    args = parse_args()
    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)

    modes = parse_mode_list(args.modes)
    snapshot = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "tag": args.tag,
    }
    term_name = os.environ.get("TERM", "")
    if term_name.lower() in {"", "dumb"}:
        snapshot.update(
            {
                "tty": os.ttyname(sys.stdin.fileno()) if os.isatty(sys.stdin.fileno()) else "",
                "term": term_name,
                "decrqm": {
                    "requested_modes": modes,
                    "by_mode": {},
                    "response_count": 0,
                    "raw_hex": "",
                },
                "kitty_keyboard": {
                    "responses": [],
                    "current": None,
                    "raw_hex": "",
                },
                "raw_response_hex": "",
            }
        )
        snapshot["status"] = "skipped_unsupported_term"
    else:
        try:
            data = capture_snapshot(
                modes=modes,
                per_query_timeout_ms=max(1, args.per_query_timeout_ms),
                kitty_timeout_ms=max(1, args.kitty_timeout_ms),
            )
            snapshot.update(data)
            snapshot["status"] = "ok"
        except Exception as exc:  # pragma: no cover - defensive capture path
            snapshot["status"] = "error"
            snapshot["error"] = str(exc)

    output.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")
    if not args.quiet:
        print(output)
    return 0 if snapshot.get("status") in {"ok", "skipped_unsupported_term"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
