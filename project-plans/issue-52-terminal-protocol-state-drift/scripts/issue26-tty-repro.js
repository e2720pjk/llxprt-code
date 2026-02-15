#!/usr/bin/env node
/**
 * Reproduction harness for Issue #26 terminal-state pollution.
 *
 * This runner uses tmux so LLXPRT runs inside a real TTY, then performs:
 * - pre/post `stty -a` capture
 * - scenario-driven key injections (English, Chinese, Ctrl-C)
 * - post-exit Enter/Tab byte probes
 * - post-exit Ctrl-C interrupt probe
 *
 * Usage:
 *   node scripts/issue26-tty-repro.js
 *   node scripts/issue26-tty-repro.js --out-dir /tmp/issue26
 *   node scripts/issue26-tty-repro.js --start-command "node scripts/start.js --yolo"
 *   node scripts/issue26-tty-repro.js --matrix scripts/issue26-tty-matrix.json
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const IMPORTANT_STTY_FLAGS = [
  'isig',
  'icanon',
  'echo',
  'iexten',
  'ixon',
  'ixoff',
  'opost',
];

let tmuxSocketPath = process.env.LLXPRT_TMUX_SOCKET_PATH ?? '';

function parseArgs(argv) {
  const args = [...argv];
  const opts = {
    outDir: undefined,
    startCommand: 'node scripts/start.js --yolo',
    matrixPath: 'scripts/issue26-tty-matrix.json',
    scenarioId: undefined,
    keepSession: false,
  };

  const takeValue = (flag) => {
    const idx = args.indexOf(flag);
    if (idx === -1) return undefined;
    const value = args[idx + 1];
    if (!value || value.startsWith('-')) {
      throw new Error(`Missing value for ${flag}`);
    }
    args.splice(idx, 2);
    return value;
  };

  const takeFlag = (flag) => {
    const idx = args.indexOf(flag);
    if (idx === -1) return false;
    args.splice(idx, 1);
    return true;
  };

  const outDir = takeValue('--out-dir');
  if (outDir) opts.outDir = outDir;

  const startCommand = takeValue('--start-command');
  if (startCommand) opts.startCommand = startCommand;

  const matrixPath = takeValue('--matrix');
  if (matrixPath) opts.matrixPath = matrixPath;

  const scenarioId = takeValue('--scenario');
  if (scenarioId) opts.scenarioId = scenarioId;

  opts.keepSession = takeFlag('--keep-session');

  if (args.length > 0) {
    throw new Error(`Unknown args: ${args.join(' ')}`);
  }

  return opts;
}

function runTmux(args, options = {}) {
  const tmuxArgs = tmuxSocketPath ? ['-S', tmuxSocketPath, ...args] : args;
  const result = spawnSync('tmux', tmuxArgs, {
    encoding: 'utf8',
    ...options,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const stderr = (result.stderr ?? '').toString().trim();
    const msg = stderr.length > 0 ? stderr : 'tmux command failed';
    throw new Error(`${msg}: tmux ${tmuxArgs.join(' ')}`);
  }
  return (result.stdout ?? '').toString();
}

function tryTmux(args) {
  try {
    return runTmux(args);
  } catch {
    return null;
  }
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function sanitizeLabel(label) {
  return label.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function capturePane(sessionName, lines = 8000) {
  return runTmux([
    'capture-pane',
    '-p',
    '-t',
    `${sessionName}:0.0`,
    '-S',
    `-${lines}`,
  ]);
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForText({
  sessionName,
  text,
  timeoutMs,
  pollMs = 200,
  lines = 8000,
}) {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    const pane = capturePane(sessionName, lines);
    if (pane.includes(text)) return pane;
    await sleep(pollMs);
  }
  throw new Error(`Timed out waiting for text "${text}" (${timeoutMs}ms)`);
}

function hasMarkerLine(text, marker) {
  const re = new RegExp(
    `(?:^|\\n)\\s*(?:\\^C\\s*)?${escapeRegex(marker)}\\s*(?:\\n|$)`,
  );
  return re.test(text);
}

async function waitForMarkerLine({
  sessionName,
  marker,
  timeoutMs,
  pollMs = 200,
  lines = 8000,
}) {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    const pane = capturePane(sessionName, lines);
    if (hasMarkerLine(pane, marker)) return pane;
    await sleep(pollMs);
  }
  throw new Error(
    `Timed out waiting for marker line "${marker}" (${timeoutMs}ms)`,
  );
}

async function waitForAnyText({
  sessionName,
  texts,
  timeoutMs,
  pollMs = 200,
  lines = 8000,
}) {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    const pane = capturePane(sessionName, lines);
    for (const text of texts) {
      if (pane.includes(text)) return { pane, matched: text };
    }
    await sleep(pollMs);
  }
  throw new Error(
    `Timed out waiting for any text: ${texts.map((t) => `"${t}"`).join(', ')}`,
  );
}

async function waitForAnyMarkerLine({
  sessionName,
  markers,
  timeoutMs,
  pollMs = 200,
  lines = 8000,
}) {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    const pane = capturePane(sessionName, lines);
    for (const markerText of markers) {
      if (hasMarkerLine(pane, markerText)) {
        return { pane, matched: markerText };
      }
    }
    await sleep(pollMs);
  }
  throw new Error(
    `Timed out waiting for any marker line: ${markers.map((m) => `"${m}"`).join(', ')}`,
  );
}

function sendKeys(sessionName, keys) {
  for (const key of keys) {
    runTmux(['send-keys', '-t', `${sessionName}:0.0`, key]);
  }
}

function sendLiteral(sessionName, text) {
  runTmux(['send-keys', '-t', `${sessionName}:0.0`, '-l', text]);
}

async function sendCommand(sessionName, command, waitMs = 150) {
  sendLiteral(sessionName, command);
  sendKeys(sessionName, ['Enter']);
  await sleep(waitMs);
}

function parseSttyStates(sttyText) {
  const tokenRe = /\b-?[a-z][a-z0-9_-]*\b/gi;
  const tokens = new Set((sttyText.match(tokenRe) ?? []).map((t) => t));
  const state = {};
  for (const flag of IMPORTANT_STTY_FLAGS) {
    if (tokens.has(flag)) {
      state[flag] = true;
    } else if (tokens.has(`-${flag}`)) {
      state[flag] = false;
    } else {
      state[flag] = null;
    }
  }
  return state;
}

function summarizeSttyDiff(beforeText, afterText) {
  const before = parseSttyStates(beforeText);
  const after = parseSttyStates(afterText);
  const changes = [];

  for (const flag of IMPORTANT_STTY_FLAGS) {
    if (before[flag] === null || after[flag] === null) continue;
    if (before[flag] !== after[flag]) {
      changes.push({
        flag,
        before: before[flag],
        after: after[flag],
      });
    }
  }

  return { before, after, changes };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractProbeValue(scrollback, prefix) {
  const re = new RegExp(`${escapeRegex(prefix)}([0-9a-f]+|timeout)__`, 'i');
  const match = scrollback.match(re);
  return match ? match[1].toLowerCase() : null;
}

function marker(kind, scenarioId) {
  return `__${kind.toUpperCase()}__${scenarioId}__`;
}

function buildRawByteProbeCommand({ waitMarker, resultPrefix }) {
  const py = [
    'import sys,select,tty,termios',
    'fd=sys.stdin.fileno()',
    'old=termios.tcgetattr(fd)',
    `print(${JSON.stringify(waitMarker)},flush=True)`,
    'tty.setraw(fd)',
    'r,_,_=select.select([fd],[],[],2)',
    "b=(sys.stdin.buffer.read(1) if r else b'')",
    'termios.tcsetattr(fd,termios.TCSADRAIN,old)',
    `print(${JSON.stringify(resultPrefix)} + (b.hex() if b else 'timeout') + '__',flush=True)`,
  ].join(';');
  return `python3 -c ${shellQuote(py)}`;
}

function hasLeakPattern(scrollback) {
  return (
    scrollback.includes('^[[A') ||
    scrollback.includes('^[[B') ||
    scrollback.includes('^[[C') ||
    scrollback.includes('^[[D')
  );
}

async function runScenario({
  cwd,
  outDir,
  startCommand,
  scenario,
  tmuxConfig,
  initialWaitMs,
  keepSession,
}) {
  const scenarioId = sanitizeLabel(scenario.id);
  const scenarioOutDir = path.join(outDir, scenarioId);
  await fs.mkdir(scenarioOutDir, { recursive: true });

  const sessionName = `issue26_${scenarioId}_${Date.now().toString(16)}`;
  const cols = Number(tmuxConfig.cols ?? 120);
  const rows = Number(tmuxConfig.rows ?? 40);
  const historyLimit = Number(tmuxConfig.historyLimit ?? 60000);
  const scrollbackLines = Number(tmuxConfig.scrollbackLines ?? 8000);
  const timeoutMs = Number(scenario.timeoutMs ?? 60000);

  const markers = {
    shellReady: marker('shell_ready', scenarioId),
    sttyBeforeDone: marker('stty_before_done', scenarioId),
    cliExited: marker('cli_exited', scenarioId),
    sttyAfterDone: marker('stty_after_done', scenarioId),
    enterWait: marker('enter_wait', scenarioId),
    enterResultPrefix: marker('enter_probe', scenarioId),
    tabWait: marker('tab_wait', scenarioId),
    tabResultPrefix: marker('tab_probe', scenarioId),
    ctrlWait: marker('ctrl_wait', scenarioId),
    ctrlDone: marker('ctrl_done', scenarioId),
    ctrlInterrupted: marker('ctrl_interrupted', scenarioId),
  };

  const sttyBeforePath = path.join(scenarioOutDir, 'stty.before.txt');
  const sttyAfterPath = path.join(scenarioOutDir, 'stty.after.txt');

  let pane = '';
  let errorMessage = null;

  try {
    tryTmux(['kill-session', '-t', sessionName]);

    runTmux([
      'new-session',
      '-d',
      '-s',
      sessionName,
      '-x',
      String(cols),
      '-y',
      String(rows),
      'zsh',
      '-f',
    ]);
    runTmux(['set-option', '-t', `${sessionName}:0`, 'remain-on-exit', 'on']);
    runTmux([
      'set-option',
      '-t',
      `${sessionName}:0`,
      'history-limit',
      String(historyLimit),
    ]);

    await sleep(900);
    await sendCommand(
      sessionName,
      `cd ${shellQuote(cwd)}; echo ${markers.shellReady}`,
      200,
    );
    await waitForMarkerLine({
      sessionName,
      marker: markers.shellReady,
      timeoutMs: 5000,
      lines: scrollbackLines,
    });

    await sendCommand(
      sessionName,
      `stty -a > ${shellQuote(sttyBeforePath)}; echo ${markers.sttyBeforeDone}`,
      200,
    );
    await waitForMarkerLine({
      sessionName,
      marker: markers.sttyBeforeDone,
      timeoutMs: 8000,
      lines: scrollbackLines,
    });

    await sendCommand(
      sessionName,
      `${startCommand}; echo ${markers.cliExited}`,
      120,
    );
    await sleep(initialWaitMs);
    try {
      await waitForText({
        sessionName,
        text: 'Type your message',
        timeoutMs: 15000,
        lines: scrollbackLines,
      });
    } catch {
      // Best-effort gate; continue even if UI copy changes.
    }

    for (const step of scenario.steps ?? []) {
      if (!step || typeof step !== 'object') continue;
      switch (step.type) {
        case 'wait': {
          const waitMs = Number(step.waitMs ?? step.ms ?? 0);
          if (Number.isFinite(waitMs) && waitMs > 0) {
            await sleep(waitMs);
          }
          break;
        }
        case 'line': {
          if (typeof step.text !== 'string') {
            throw new Error(`Scenario step "line" missing text`);
          }
          sendLiteral(sessionName, step.text);
          const submitKeys =
            Array.isArray(step.submitKeys) && step.submitKeys.length > 0
              ? step.submitKeys.filter((k) => typeof k === 'string')
              : ['Enter'];
          sendKeys(sessionName, submitKeys);
          await sleep(Number(step.waitMs ?? 300));
          break;
        }
        case 'text': {
          if (typeof step.text !== 'string') {
            throw new Error(`Scenario step "text" missing text`);
          }
          sendLiteral(sessionName, step.text);
          await sleep(Number(step.waitMs ?? 200));
          break;
        }
        case 'key': {
          if (typeof step.key !== 'string') {
            throw new Error(`Scenario step "key" missing key`);
          }
          sendKeys(sessionName, [step.key]);
          await sleep(Number(step.waitMs ?? 200));
          break;
        }
        case 'keys': {
          if (!Array.isArray(step.keys)) {
            throw new Error(`Scenario step "keys" missing keys[]`);
          }
          sendKeys(
            sessionName,
            step.keys.filter((k) => typeof k === 'string'),
          );
          await sleep(Number(step.waitMs ?? 200));
          break;
        }
        default:
          throw new Error(`Unknown scenario step type: ${String(step.type)}`);
      }
    }

    await waitForMarkerLine({
      sessionName,
      marker: markers.cliExited,
      timeoutMs,
      lines: scrollbackLines,
    });

    await sendCommand(
      sessionName,
      `stty -a > ${shellQuote(sttyAfterPath)}; echo ${markers.sttyAfterDone}`,
      200,
    );
    await waitForMarkerLine({
      sessionName,
      marker: markers.sttyAfterDone,
      timeoutMs: 8000,
      lines: scrollbackLines,
    });

    const enterProbeCmd = buildRawByteProbeCommand({
      waitMarker: markers.enterWait,
      resultPrefix: markers.enterResultPrefix,
    });
    await sendCommand(sessionName, enterProbeCmd, 120);
    await waitForMarkerLine({
      sessionName,
      marker: markers.enterWait,
      timeoutMs: 4000,
      lines: scrollbackLines,
    });
    sendKeys(sessionName, ['Enter']);
    await waitForAnyText({
      sessionName,
      texts: [
        `${markers.enterResultPrefix}0d__`,
        `${markers.enterResultPrefix}0a__`,
        `${markers.enterResultPrefix}timeout__`,
      ],
      timeoutMs: 5000,
      lines: scrollbackLines,
    });

    const tabProbeCmd = buildRawByteProbeCommand({
      waitMarker: markers.tabWait,
      resultPrefix: markers.tabResultPrefix,
    });
    await sendCommand(sessionName, tabProbeCmd, 120);
    await waitForMarkerLine({
      sessionName,
      marker: markers.tabWait,
      timeoutMs: 4000,
      lines: scrollbackLines,
    });
    sendKeys(sessionName, ['Tab']);
    await waitForAnyText({
      sessionName,
      texts: [
        `${markers.tabResultPrefix}09__`,
        `${markers.tabResultPrefix}timeout__`,
      ],
      timeoutMs: 5000,
      lines: scrollbackLines,
    });

    const ctrlProbeCmd = `python3 -c ${shellQuote(
      `import time;print(${JSON.stringify(markers.ctrlWait)},flush=True);` +
        `\ntry:\n time.sleep(5)\n print(${JSON.stringify(markers.ctrlDone)},flush=True)\n` +
        `except KeyboardInterrupt:\n print(${JSON.stringify(markers.ctrlInterrupted)},flush=True)`,
    )}`;
    await sendCommand(sessionName, ctrlProbeCmd, 120);
    await waitForMarkerLine({
      sessionName,
      marker: markers.ctrlWait,
      timeoutMs: 4000,
      lines: scrollbackLines,
    });
    sendKeys(sessionName, ['C-c']);
    await waitForAnyMarkerLine({
      sessionName,
      markers: [markers.ctrlInterrupted, markers.ctrlDone],
      timeoutMs: 8000,
      lines: scrollbackLines,
    });

    pane = capturePane(sessionName, scrollbackLines);
    const screen = runTmux(['capture-pane', '-p', '-t', `${sessionName}:0.0`]);
    await fs.writeFile(path.join(scenarioOutDir, 'screen.txt'), screen, 'utf8');
    await fs.writeFile(
      path.join(scenarioOutDir, 'scrollback.txt'),
      pane,
      'utf8',
    );
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
    try {
      pane = capturePane(sessionName, 8000);
    } catch {
      pane = '';
    }
    await fs.writeFile(
      path.join(scenarioOutDir, 'error.json'),
      JSON.stringify({ error: errorMessage }, null, 2),
      'utf8',
    );
    await fs.writeFile(
      path.join(scenarioOutDir, 'scrollback.error.txt'),
      pane,
      'utf8',
    );
  } finally {
    if (!keepSession) {
      tryTmux(['kill-session', '-t', sessionName]);
    }
  }

  let sttyBefore = '';
  let sttyAfter = '';
  try {
    sttyBefore = await fs.readFile(sttyBeforePath, 'utf8');
  } catch {
    // ignore
  }
  try {
    sttyAfter = await fs.readFile(sttyAfterPath, 'utf8');
  } catch {
    // ignore
  }

  const sttySummary =
    sttyBefore && sttyAfter
      ? summarizeSttyDiff(sttyBefore, sttyAfter)
      : { before: {}, after: {}, changes: [] };
  const scrollbackText = pane || '';

  const enterValue = extractProbeValue(
    scrollbackText,
    markers.enterResultPrefix,
  );
  const tabValue = extractProbeValue(scrollbackText, markers.tabResultPrefix);

  const ctrlDoneLine = hasMarkerLine(scrollbackText, markers.ctrlDone);
  const ctrlInterruptedLine = hasMarkerLine(
    scrollbackText,
    markers.ctrlInterrupted,
  );
  const ctrlInterrupted = ctrlInterruptedLine && !ctrlDoneLine;

  const suspiciousSttyChange = sttySummary.changes.some(
    (item) =>
      (item.flag === 'icanon' ||
        item.flag === 'echo' ||
        item.flag === 'isig') &&
      item.after === false,
  );

  const rawLeakDetected = hasLeakPattern(scrollbackText);
  const enterResponsive = enterValue === '0d' || enterValue === '0a';
  const tabResponsive = tabValue === '09';

  return {
    scenarioId,
    description: scenario.description ?? '',
    sessionName: keepSession ? sessionName : null,
    status: errorMessage ? 'error' : 'ok',
    error: errorMessage,
    artifactsDir: scenarioOutDir,
    probes: {
      enterValue,
      tabValue,
      ctrlInterrupted,
      rawLeakDetected,
    },
    stty: sttySummary,
    ttyPollutionSuspected:
      Boolean(errorMessage) ||
      suspiciousSttyChange ||
      !enterResponsive ||
      !tabResponsive ||
      !ctrlInterrupted ||
      rawLeakDetected,
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const outDir = opts.outDir
    ? path.resolve(cwd, opts.outDir)
    : path.join(os.tmpdir(), `llxprt-issue26-tty-repro-${Date.now()}`);
  await fs.mkdir(outDir, { recursive: true });
  if (!tmuxSocketPath) {
    tmuxSocketPath = path.join(outDir, 'tmux.sock');
  }

  const matrixPath = path.resolve(cwd, opts.matrixPath);
  const matrix = JSON.parse(await fs.readFile(matrixPath, 'utf8'));
  let scenarios = Array.isArray(matrix.scenarios) ? matrix.scenarios : [];
  if (opts.scenarioId) {
    scenarios = scenarios.filter((s) => s?.id === opts.scenarioId);
  }
  if (scenarios.length === 0) {
    throw new Error(
      opts.scenarioId
        ? `Scenario "${opts.scenarioId}" not found in matrix: ${matrixPath}`
        : `No scenarios found in matrix: ${matrixPath}`,
    );
  }

  const tmuxCheck = spawnSync('tmux', ['-V'], { encoding: 'utf8' });
  if (tmuxCheck.status !== 0) {
    throw new Error('tmux is required but not available on PATH');
  }

  const results = [];
  for (const scenario of scenarios) {
    const result = await runScenario({
      cwd,
      outDir,
      startCommand: opts.startCommand,
      scenario,
      tmuxConfig: matrix.tmux ?? {},
      initialWaitMs: Number(matrix.initialWaitMs ?? 5000),
      keepSession: opts.keepSession,
    });
    results.push(result);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    cwd,
    startCommand: opts.startCommand,
    matrixPath,
    outDir,
    tmuxSocketPath,
    results,
  };

  await fs.writeFile(
    path.join(outDir, 'report.json'),
    JSON.stringify(report, null, 2),
    'utf8',
  );

  const lines = [];
  lines.push(`# Issue #26 TTY Repro Report`);
  lines.push('');
  lines.push(`- generatedAt: ${report.generatedAt}`);
  lines.push(`- cwd: ${cwd}`);
  lines.push(`- matrix: ${matrixPath}`);
  lines.push(`- startCommand: ${opts.startCommand}`);
  lines.push(`- outDir: ${outDir}`);
  lines.push(`- tmuxSocketPath: ${tmuxSocketPath}`);
  lines.push('');
  lines.push(
    '| Scenario | Status | Suspicious | Enter | Tab | Ctrl-C | stty Changes |',
  );
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const r of results) {
    lines.push(
      [
        `| ${r.scenarioId}`,
        r.status,
        r.ttyPollutionSuspected ? 'yes' : 'no',
        r.probes.enterValue ?? 'n/a',
        r.probes.tabValue ?? 'n/a',
        r.probes.ctrlInterrupted ? 'ok' : 'fail',
        r.stty.changes
          .map(
            (c) =>
              `${c.flag}:${c.before ? 'on' : 'off'}->${c.after ? 'on' : 'off'}`,
          )
          .join(', ') || 'none',
      ].join(' | ') + ' |',
    );
  }
  lines.push('');
  await fs.writeFile(
    path.join(outDir, 'report.md'),
    `${lines.join('\n')}\n`,
    'utf8',
  );

  console.log(
    [
      `Issue #26 tty reproduction finished.`,
      `Artifacts: ${outDir}`,
      `JSON report: ${path.join(outDir, 'report.json')}`,
      `Markdown report: ${path.join(outDir, 'report.md')}`,
    ].join('\n'),
  );
}

main().catch((error) => {
  const msg =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(msg);
  process.exitCode = 1;
});
