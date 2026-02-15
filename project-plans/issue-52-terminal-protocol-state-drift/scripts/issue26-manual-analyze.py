#!/usr/bin/env python3
"""
Analyze Issue #26 manual-capture artifacts.

Input directory must contain:
- stty.before.txt
- stty.after.txt (optional if runner crashed early)
- session.typescript

Output:
- summary.json
- summary.md
"""

from __future__ import annotations

import argparse
import json
import re
import time
from pathlib import Path

IMPORTANT_STTY_FLAGS = [
    "isig",
    "icanon",
    "echo",
    "iexten",
    "ixon",
    "ixoff",
    "opost",
]

PROTOCOL_MODE_LABELS = {
    "1000": "mouse_x10",
    "1002": "mouse_button_event_tracking",
    "1003": "mouse_any_event_tracking",
    "1004": "focus_tracking",
    "1005": "mouse_utf8",
    "1006": "mouse_sgr",
    "1015": "mouse_urxvt",
    "1016": "mouse_sgr_pixels",
    "1049": "alternate_screen_buffer",
    "2004": "bracketed_paste",
    "2026": "synchronized_output",
}

PROTOCOL_SUSPICIOUS_ENABLE_MODES = {
    "1002",
    "1003",
    "1004",
    "1005",
    "1006",
    "1015",
    "1016",
    "1049",
    "2004",
    "2026",
}

DECRPM_STATE_LABEL = {
    0: "not_recognized",
    1: "set",
    2: "reset",
    3: "permanently_set",
    4: "permanently_reset",
}


def parse_stty_states(stty_text: str) -> dict[str, bool | None]:
    tokens = set(re.findall(r"\b-?[a-z][a-z0-9_-]*\b", stty_text.lower()))
    state: dict[str, bool | None] = {}
    for flag in IMPORTANT_STTY_FLAGS:
        if flag in tokens:
            state[flag] = True
        elif f"-{flag}" in tokens:
            state[flag] = False
        else:
            state[flag] = None
    return state


def summarize_stty_diff(before_text: str, after_text: str) -> dict:
    before = parse_stty_states(before_text)
    after = parse_stty_states(after_text)
    changes = []
    for flag in IMPORTANT_STTY_FLAGS:
        b = before.get(flag)
        a = after.get(flag)
        if b is None or a is None:
            continue
        if b != a:
            changes.append({"flag": flag, "before": b, "after": a})
    return {"before": before, "after": after, "changes": changes}


def extract_probe(session_text: str, name: str) -> str | None:
    pattern = re.compile(
        rf"__ISSUE26_{re.escape(name)}_PROBE__([0-9a-f]+|timeout)__", re.IGNORECASE
    )
    match = pattern.search(session_text)
    return match.group(1).lower() if match else None


def has_marker(session_text: str, name: str) -> bool:
    return f"__ISSUE26_{name}__" in session_text


def has_raw_leak_pattern(session_text: str) -> bool:
    for pattern in ("^[[A", "^[[B", "^[[C", "^[[D"):
        if pattern in session_text:
            return True
    return False


def detect_protocol_leak_signals(session_text: str) -> dict:
    caret_csi = re.findall(r"\^\[\[[0-9;]*[A-Za-z~u]", session_text)
    raw_csi_u = re.findall(r"\x1b\[[0-9;]*u", session_text)
    raw_focus = re.findall(r"\x1b\[\?1004[hl]", session_text)
    return {
        "caret_csi_count": len(caret_csi),
        "raw_csi_u_count": len(raw_csi_u),
        "raw_focus_toggle_count": len(raw_focus),
    }


def detect_capture_errors(session_text: str) -> list[str]:
    checks = [
        ("termios.error", "termios.error occurred during probe"),
        ("Inappropriate ioctl for device", "stdin was not a tty during probe"),
        ("Traceback (most recent call last):", "python traceback detected in capture"),
        ("SyntaxError:", "python probe syntax error detected"),
    ]
    errors = []
    for needle, message in checks:
        if needle in session_text:
            errors.append(message)
    return errors


def load_optional_json(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8", errors="replace"))
        if isinstance(value, dict):
            return value
    except Exception:
        return {"status": "error", "error": "invalid_json"}
    return {}


def normalize_protocol_modes(snapshot: dict) -> dict[str, dict]:
    decrqm = snapshot.get("decrqm")
    if not isinstance(decrqm, dict):
        return {}
    by_mode = decrqm.get("by_mode")
    if not isinstance(by_mode, dict):
        return {}

    result: dict[str, dict] = {}
    for mode_key, raw_entry in by_mode.items():
        key = str(mode_key)
        entry = raw_entry if isinstance(raw_entry, dict) else {}
        value_raw = entry.get("value")
        try:
            value = int(value_raw)
        except Exception:
            value = None
        state_raw = entry.get("state")
        if isinstance(state_raw, str) and state_raw:
            state = state_raw
        elif value is not None:
            state = DECRPM_STATE_LABEL.get(value, "unknown")
        else:
            state = "unknown"
        result[key] = {"value": value, "state": state}
    return result


def get_kitty_current(snapshot: dict) -> str | None:
    kitty = snapshot.get("kitty_keyboard")
    if not isinstance(kitty, dict):
        return None
    value = kitty.get("current")
    return str(value) if value is not None else None


def summarize_protocol_diff(before_snapshot: dict, after_snapshot: dict) -> dict:
    before_modes = normalize_protocol_modes(before_snapshot)
    after_modes = normalize_protocol_modes(after_snapshot)

    all_modes = sorted(
        set(before_modes.keys()) | set(after_modes.keys()),
        key=lambda s: int(s) if s.isdigit() else 10**9,
    )

    changes = []
    suspicious_changes = []
    for mode in all_modes:
        before = before_modes.get(mode, {"value": None, "state": "missing"})
        after = after_modes.get(mode, {"value": None, "state": "missing"})
        if before["value"] == after["value"] and before["state"] == after["state"]:
            continue
        change = {
            "mode": mode,
            "label": PROTOCOL_MODE_LABELS.get(mode, f"mode_{mode}"),
            "before": before,
            "after": after,
        }
        changes.append(change)

        before_enabled = before["state"] in {"set", "permanently_set"}
        after_enabled = after["state"] in {"set", "permanently_set"}
        if mode in PROTOCOL_SUSPICIOUS_ENABLE_MODES and (not before_enabled and after_enabled):
            suspicious_changes.append(change)

    before_kitty = get_kitty_current(before_snapshot)
    after_kitty = get_kitty_current(after_snapshot)
    kitty_changed = before_kitty != after_kitty
    kitty_suspicious = kitty_changed and bool(after_kitty)

    return {
        "before_status": before_snapshot.get("status"),
        "after_status": after_snapshot.get("status"),
        "modes": {
            "before": before_modes,
            "after": after_modes,
            "changes": changes,
            "suspicious_changes": suspicious_changes,
        },
        "kitty_keyboard": {
            "before": before_kitty,
            "after": after_kitty,
            "changed": kitty_changed,
            "suspicious": kitty_suspicious,
        },
    }


def build_summary(out_dir: Path, runner_exit: int | None) -> dict:
    before_path = out_dir / "stty.before.txt"
    after_path = out_dir / "stty.after.txt"
    session_path = out_dir / "session.typescript"
    protocol_before_path = out_dir / "protocol.before.json"
    protocol_after_path = out_dir / "protocol.after.json"

    before_text = before_path.read_text(encoding="utf-8", errors="replace") if before_path.exists() else ""
    after_text = after_path.read_text(encoding="utf-8", errors="replace") if after_path.exists() else ""
    session_text = session_path.read_text(encoding="utf-8", errors="replace") if session_path.exists() else ""

    stty = (
        summarize_stty_diff(before_text, after_text)
        if before_text and after_text
        else {"before": {}, "after": {}, "changes": []}
    )
    enter_value = extract_probe(session_text, "ENTER")
    tab_value = extract_probe(session_text, "TAB")
    ctrl_interrupted = has_marker(session_text, "CTRL_INTERRUPTED")
    ctrl_done = has_marker(session_text, "CTRL_DONE")
    raw_leak_detected = has_raw_leak_pattern(session_text)
    capture_errors = detect_capture_errors(session_text)
    protocol_signals = detect_protocol_leak_signals(session_text)
    protocol_before = load_optional_json(protocol_before_path)
    protocol_after = load_optional_json(protocol_after_path)
    terminal_protocols = summarize_protocol_diff(protocol_before, protocol_after)
    suspicious_protocol_drift = bool(
        terminal_protocols["modes"]["suspicious_changes"]
        or terminal_protocols["kitty_keyboard"]["suspicious"]
    )
    probe_timeouts = []
    if enter_value == "timeout":
        probe_timeouts.append("enter")
    if tab_value == "timeout":
        probe_timeouts.append("tab")

    suspicious_stty_change = any(
        item["flag"] in {"isig", "icanon", "echo"} and item["after"] is False
        for item in stty["changes"]
    )
    enter_ok = enter_value in {"0d", "0a"}
    tab_ok = tab_value == "09"
    ctrl_ok = ctrl_interrupted and not ctrl_done

    suspected = None
    analysis_status = "inconclusive_capture_error" if capture_errors else "ok"
    suspected_category = None
    evidence = []
    if not capture_errors:
        if (
            probe_timeouts
            and not suspicious_stty_change
            and not raw_leak_detected
            and not suspicious_protocol_drift
        ):
            analysis_status = "inconclusive_probe_timeout"
            suspected = None
            suspected_category = "probe_timeout"
            evidence.append(f"probe timeout(s): {', '.join(probe_timeouts)}")
            evidence.append("result is inconclusive because no key byte was captured")
        else:
            suspected = (
                suspicious_stty_change
                or suspicious_protocol_drift
                or not enter_ok
                or not tab_ok
                or not ctrl_ok
                or raw_leak_detected
            )
            if suspicious_stty_change:
                suspected_category = "line_discipline_leak"
                evidence.append("stty flag drift detected in isig/icanon/echo")
            elif suspicious_protocol_drift:
                suspected_category = "terminal_protocol_state_drift"
                for item in terminal_protocols["modes"]["suspicious_changes"]:
                    evidence.append(
                        "terminal mode enabled after run: "
                        f"{item['label']}({item['mode']}) "
                        f"{item['before']['state']}->{item['after']['state']}"
                    )
                if terminal_protocols["kitty_keyboard"]["suspicious"]:
                    evidence.append(
                        "kitty keyboard state changed and remained enabled "
                        f"({terminal_protocols['kitty_keyboard']['before']} -> "
                        f"{terminal_protocols['kitty_keyboard']['after']})"
                    )
            elif suspected:
                likely_protocol_leak = (
                    protocol_signals["caret_csi_count"] > 0
                    or protocol_signals["raw_csi_u_count"] > 0
                    or protocol_signals["raw_focus_toggle_count"] > 0
                    or (enter_value in {"1b", "5b"})
                    or (tab_value in {"1b", "5b"})
                )
                if likely_protocol_leak:
                    suspected_category = "terminal_protocol_leak"
                    evidence.append("probe bytes look like CSI prefix (ESC/[)")
                    evidence.append("CSI-style sequences observed in transcript")
                else:
                    suspected_category = "input_probe_anomaly"
                    evidence.append("probe bytes unexpected without clear stty drift")
            else:
                suspected_category = "none"

    return {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "out_dir": str(out_dir),
        "runner_exit_code": runner_exit,
        "analysis_status": analysis_status,
        "capture_errors": capture_errors,
        "suspected_category": suspected_category,
        "evidence": evidence,
        "protocol_signals": protocol_signals,
        "terminal_protocols": terminal_protocols,
        "probe_timeouts": probe_timeouts,
        "probes": {
            "enter_value": enter_value,
            "tab_value": tab_value,
            "ctrl_interrupted": ctrl_interrupted,
            "ctrl_done": ctrl_done,
            "raw_leak_detected": raw_leak_detected,
        },
        "stty": stty,
        "tty_pollution_suspected": suspected,
    }


def write_markdown(summary: dict, out_path: Path) -> None:
    stty_changes = summary["stty"]["changes"]
    stty_text = (
        ", ".join(
            f"{item['flag']}:{'on' if item['before'] else 'off'}->{'on' if item['after'] else 'off'}"
            for item in stty_changes
        )
        if stty_changes
        else "none"
    )
    p = summary["probes"]
    proto = summary.get("terminal_protocols") or {}
    proto_modes = (proto.get("modes") or {})
    proto_changes = proto_modes.get("changes") or []
    proto_suspicious = proto_modes.get("suspicious_changes") or []
    kitty = proto.get("kitty_keyboard") or {}

    lines = [
        "# Issue #26 Manual Capture Summary",
        "",
        f"- generated_at: {summary['generated_at']}",
        f"- out_dir: {summary['out_dir']}",
        f"- runner_exit_code: {summary['runner_exit_code']}",
        f"- analysis_status: {summary['analysis_status']}",
        f"- suspected_category: {summary.get('suspected_category') or 'n/a'}",
        f"- tty_pollution_suspected: {('yes' if summary['tty_pollution_suspected'] else 'no') if summary['tty_pollution_suspected'] is not None else 'inconclusive'}",
        "",
        "| Probe | Value |",
        "| --- | --- |",
        f"| enter_value | {p['enter_value'] or 'n/a'} |",
        f"| tab_value | {p['tab_value'] or 'n/a'} |",
        f"| ctrl_interrupted | {'yes' if p['ctrl_interrupted'] else 'no'} |",
        f"| ctrl_done | {'yes' if p['ctrl_done'] else 'no'} |",
        f"| raw_leak_detected | {'yes' if p['raw_leak_detected'] else 'no'} |",
        "",
        f"- stty_changes: {stty_text}",
        f"- protocol_signals: caret_csi={summary['protocol_signals']['caret_csi_count']}, raw_csi_u={summary['protocol_signals']['raw_csi_u_count']}, raw_focus_toggle={summary['protocol_signals']['raw_focus_toggle_count']}",
        f"- terminal_protocol_snapshot_status: before={proto.get('before_status') or 'n/a'}, after={proto.get('after_status') or 'n/a'}",
        f"- terminal_protocol_mode_changes: {len(proto_changes)}",
        f"- terminal_protocol_suspicious_changes: {len(proto_suspicious)}",
        f"- kitty_state_changed: {'yes' if kitty.get('changed') else 'no'}",
        f"- probe_timeouts: {', '.join(summary.get('probe_timeouts') or []) if summary.get('probe_timeouts') else 'none'}",
        "",
    ]
    if proto_suspicious:
        lines.append("## Suspicious Terminal Protocol Changes")
        lines.append("")
        for item in proto_suspicious:
            lines.append(
                f"- {item['label']}({item['mode']}): "
                f"{item['before']['state']} -> {item['after']['state']}"
            )
        lines.append("")
    if summary.get("evidence"):
        lines.append("## Evidence")
        lines.append("")
        for item in summary["evidence"]:
            lines.append(f"- {item}")
        lines.append("")
    if summary.get("capture_errors"):
        lines.append("## Capture Errors")
        lines.append("")
        for error in summary["capture_errors"]:
            lines.append(f"- {error}")
        lines.append("")
    out_path.write_text("\n".join(lines), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Analyze Issue #26 manual capture output")
    parser.add_argument("--out-dir", required=True, help="Capture output directory")
    parser.add_argument(
        "--runner-exit", type=int, default=None, help="Runner shell exit code"
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    summary = build_summary(out_dir, args.runner_exit)
    summary_json_path = out_dir / "summary.json"
    summary_md_path = out_dir / "summary.md"

    summary_json_path.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    write_markdown(summary, summary_md_path)

    print(f"Summary JSON: {summary_json_path}")
    print(f"Summary Markdown: {summary_md_path}")
    if summary["tty_pollution_suspected"] is None:
        print("TTY pollution suspected: inconclusive")
    else:
        print(f"TTY pollution suspected: {'yes' if summary['tty_pollution_suspected'] else 'no'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
