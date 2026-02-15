# Issue #26 交接文件 v2（2026-02-14）

## 1) 文件目的
這份文件給下一位接手 Agent，目標是避免重複嘗試，並直接延續目前「可自動化、可觀測、可判讀」的除錯流程。

本文涵蓋：
- 問題追蹤流程（自動化 + 手動真機）
- 腳本清單與使用方式
- 設計概念與判讀準則
- 迭代歷史（包含踩坑與修正）
- 目前發現、證據與未完成項目
- 下一輪建議修復計畫

---

## 2) 問題定義（更新版）
Issue #26 表現為：
- 結束 LLXPRT 後，終端輸入行為異常（特別是中文輸入法情境）
- 控制鍵/方向鍵序列可能滲漏成文字（例如 `^[[...`）
- 使用者可感知到 Enter/Tab/Ctrl-C 不再是預期語意

目前關鍵更新：
- **不只是 raw/cooked mode 的 stty 漂移問題**
- 在真機手動重現中，`stty` 前後一致，但仍可觀測到 protocol leakage 訊號

---

## 3) 目前結論（信心等級）
### 3.1 高信心
1. 在 tmux/pty 自動化中，多數場景顯示正常（無 stty 漂移，probes 正常）。
2. 在真機（使用者實際 IME）手動重現中，確實觀測到異常：
   - `enter_probe=1b`
   - `tab_probe=5b`
   - transcript 出現大量 `^[[...`
   - `stty` 前後無差異
3. 此模式更接近「terminal protocol cleanup 不完整」而非 `icanon/echo/isig` 沒復原。

### 3.2 中信心（待程式碼修復驗證）
可能漏還原的協定狀態包含：
- focus tracking
- kitty keyboard protocol
- bracketed paste
- mouse reporting

---

## 4) 腳本與產物清單

### 4.1 tmux 矩陣重現（自動）
- `/Users/caishanghong/Shopify/cli-tool/llxprt-code-2/scripts/issue26-tty-repro.js`
- `/Users/caishanghong/Shopify/cli-tool/llxprt-code-2/scripts/issue26-tty-matrix.json`

用途：
- 在 tmux TTY 中自動執行情境矩陣
- 取得 `stty.before/after`
- 執行 Enter/Tab/Ctrl-C probes
- 產出 `report.json` + `report.md`

常用指令：
```bash
node scripts/issue26-tty-repro.js --out-dir /tmp/issue26-tmux-run
node scripts/issue26-tty-repro.js --out-dir /tmp/issue26-tmux-run --scenario chinese_input_interrupt
```

最新整合結果（基準）：
- `/tmp/issue26-tmux-run14/report.md`
- 三情境皆 `ok`、`ttyPollutionSuspected=no`

---

### 4.2 PTY 模擬（無 tmux）
- `/Users/caishanghong/Shopify/cli-tool/llxprt-code-2/scripts/issue26-pty-probe.py`

用途：
- 直接用 pseudo-terminal 模擬輸入
- 覆蓋中文輸入 + IME-like 未完成 buffer（`nihao`）+ Ctrl-C
- 產出 `report.json`

常用指令：
```bash
python3 scripts/issue26-pty-probe.py --scenario english_normal_exit --out-dir /tmp/issue26-pty-run
python3 scripts/issue26-pty-probe.py --scenario chinese_input_interrupt --out-dir /tmp/issue26-pty-run
```

參考結果：
- `/private/tmp/issue26-pty-run7/report.json`（english）
- `/private/tmp/issue26-pty-run6/report.json`（chinese）

---

### 4.3 真機手動採證（核心）
- `/Users/caishanghong/Shopify/cli-tool/llxprt-code-2/scripts/issue26-manual-capture.sh`
- `/Users/caishanghong/Shopify/cli-tool/llxprt-code-2/scripts/issue26-manual-analyze.py`
- `/Users/caishanghong/Shopify/cli-tool/llxprt-code-2/scripts/issue26-terminal-protocol-snapshot.py`

用途：
- 在「使用者真實終端 + 真實中文 IME」條件下採證
- 錄製 `session.typescript`
- 比對 `stty.before/after`
- 比對 `protocol.before/after.json`（DECRQM + kitty query）
- probes 後自動產出 `summary.json` / `summary.md`

執行：
```bash
scripts/issue26-manual-capture.sh --out-dir /tmp/issue26-manual-rerun
```

---

### 4.4 macOS 鍵盤事件自動化（新）
- `/Users/caishanghong/Shopify/cli-tool/llxprt-code-2/scripts/issue26-macos-keydriver.py`
- `/Users/caishanghong/Shopify/cli-tool/llxprt-code-2/scripts/issue26-macos-auto-capture.sh`

用途：
- 透過 `System Events` 注入真實按鍵事件（非直接寫 byte）
- 依 `session.typescript` marker 自動送出重現序列 + probe 按鍵
- 連跑多輪並輸出 `aggregate.json` / `aggregate.md`
- 支援先輪詢 TUI 活動再觸發（避免一啟動就 `/quit`）
- 支援分離注入後端（`repro`/`probe` 可各自使用 `applescript|tty|hybrid`）
- probe 有多次發送與回執檢查，降低 `probe_timeout` 假陰性

執行：
```bash
scripts/issue26-macos-auto-capture.sh \
  --out-dir /tmp/issue26-macos-auto \
  --scenario ime_interrupt_then_quit \
  --iterations 5
```

建議的「先讓 TUI 跑一段再觸發」：
```bash
scripts/issue26-macos-auto-capture.sh \
  --out-dir /tmp/issue26-macos-auto-polling \
  --scenario ime_interrupt_then_quit \
  --iterations 5 \
  --warmup-prompt "請先輸出 10 行測試內容" \
  --warmup-submit yes \
  --activity-growth-bytes 400 \
  --activity-timeout 90 \
  --runtime-wait-ms 3000
```

帶期望值（可給 Agent 自動判斷）：
```bash
# 修補前：期望至少一次重現（需有有效 ok run）
scripts/issue26-macos-auto-capture.sh \
  --out-dir /tmp/issue26-macos-before-fix \
  --iterations 8 \
  --expect-suspected yes \
  --require-ok-runs 1

# 修補後：期望不再重現（需有有效 ok run）
scripts/issue26-macos-auto-capture.sh \
  --out-dir /tmp/issue26-macos-after-fix \
  --iterations 8 \
  --stop-on-repro no \
  --expect-suspected no \
  --require-ok-runs 1
```

前置條件：
- macOS
- `osascript` 可用
- Terminal/iTerm 有 Accessibility 權限（可讓 System Events 發按鍵）

---

## 5) 這次關鍵證據（使用者真機）
來源：
- `/tmp/issue26-manual-rerun/summary.json`
- `/tmp/issue26-manual-rerun/session.typescript`

摘要：
- `analysis_status=ok`
- `tty_pollution_suspected=true`
- `suspected_category=terminal_protocol_leak`
- `enter_value=1b`
- `tab_value=5b`
- `ctrl_interrupted=false`, `ctrl_done=true`
- `stty` 無變化（`isig/icanon/echo` 不漂移）
- `protocol_signals`: `caret_csi_count=14`, `raw_focus_toggle_count=5`

結論：
- 這次已成功捕捉到「非 stty 漂移、而是 terminal protocol leakage」的證據鏈。

---

## 6) 設計概念（為何這樣測）
為了避免再走「只憑推論改碼」：

1. **分層驗證**
   - 層 A：tmux/pty 自動化（快速迭代）
   - 層 B：真機手動採證（最終真相）

2. **分離兩類問題**
   - 類型 1：line discipline 漏還原（看 `stty`)
   - 類型 2：protocol leakage（看 probe bytes + transcript CSI）
   - 類型 3：terminal protocol state drift（看 DECRQM/kitty before-after）

3. **可機器判讀**
   - 用 marker + probe byte，避免只看肉眼截圖

---

## 7) 迭代歷史（本輪）
### Iteration A：建立 tmux 矩陣
- 新增 `issue26-tty-repro.js` + `issue26-tty-matrix.json`
- 初期問題：marker 偵測不穩、/quit 被 UI completion 影響、scenario race

### Iteration B：強化 tmux runner 穩定性
- 加 `--scenario` 單情境執行
- slash command submit 改 `Escape + Enter`
- marker 偵測支援 `^C` 前綴
- 加 UI readiness gate（`Type your message`）

### Iteration C：建立 PTY probe
- 新增 `issue26-pty-probe.py`
- 修正 EIO（PTY 子程序提前關閉）容錯
- 修正 ctrl probe Python 語法與終止條件

### Iteration D：建立真機採證
- 新增 `issue26-manual-capture.sh` / `issue26-manual-analyze.py`
- 踩坑：`termios.error (Inappropriate ioctl for device)`  
  根因是 probe 透過 heredoc 讓 stdin 變 pipe  
  修正為輸出 probe 檔後 `python3 file.py` 執行

### Iteration E：分析器升級
- `capture error` 改標 `inconclusive_capture_error`
- 新增 `suspected_category` 與 `protocol_signals`
- 可直接區分 `line_discipline_leak` vs `terminal_protocol_leak`

### Iteration F：macOS 自動鍵盤注入與 timeout 判讀修正
- 新增 `issue26-macos-keydriver.py`（marker 驅動的按鍵注入）
- 新增 `issue26-macos-auto-capture.sh`（連跑 + aggregate）
- `issue26-manual-capture.sh` 新增 `--probe-timeout`
- `issue26-manual-analyze.py` 新增 `inconclusive_probe_timeout`，避免沒按到鍵時誤判重現成功

### Iteration G：終端協定快照檢測（DECRQM/kitty）
- 新增 `issue26-terminal-protocol-snapshot.py`
- `issue26-manual-capture.sh` 在 CLI 前後各做一次 snapshot，輸出：
  - `protocol.before.json`
  - `protocol.after.json`
- `issue26-manual-analyze.py` 新增 `terminal_protocols` 差異分析：
  - `terminal_protocol_mode_changes`
  - `terminal_protocol_suspicious_changes`
  - `terminal_protocol_snapshot_status`
  - 新分類 `terminal_protocol_state_drift`

---

## 8) 已知限制與注意事項
1. tmux/pty 可能無法完整重現 macOS IME 組字狀態。
2. manual capture 需在使用者真實操作下執行，才有代表性。
3. `/tmp` 與 `/private/tmp` 在 macOS 可能是同一路徑別名，文件中兩者都可能出現。
4. `script` 產生 transcript 含大量 ANSI/CSI；判讀以 `summary.json` 為主，transcript 做佐證。
5. 若 `summary.analysis_status=inconclusive_probe_timeout`，代表該輪未取得有效 probe bytes，不可視為重現成功。
6. 若 macOS keydriver 出現 `failed to activate app`，通常是 app 名稱或 Accessibility 權限問題。
7. 自動模式若偵測到前景 app 切走（例如瀏覽器被帶到前景），probe 可能 timeout；需固定 `--app` 或避免切窗。
8. 若 `TERM` 為 `dumb`，protocol snapshot 會標記 `skipped_unsupported_term`，此時不能用該輪判定協定模式是否漂移。

---

## 9) 下一輪修復計畫（建議）
### 9.1 目標
確保所有退出路徑（normal `/quit`、Ctrl-C、SIGTERM、error）都「同步且冪等」地回收 terminal protocols。

### 9.2 優先修改檔案（候選）
- `/Users/caishanghong/Shopify/cli-tool/llxprt-code-2/packages/cli/src/ui/utils/kittyProtocolDetector.ts`
- `/Users/caishanghong/Shopify/cli-tool/llxprt-code-2/packages/cli/src/ui/hooks/useBracketedPaste.ts`
- `/Users/caishanghong/Shopify/cli-tool/llxprt-code-2/packages/cli/src/gemini.tsx`
- `/Users/caishanghong/Shopify/cli-tool/llxprt-code-2/packages/cli/src/ui/AppContainer.tsx`

### 9.3 實作策略
1. 建立單一 `restoreTerminalProtocols()`（idempotent）
2. 退出前固定發送 disable 序列（focus/kitty/bracketed/mouse）
3. `process.on('exit'|'SIGINT'|'SIGTERM')` + UI unmount 同步呼叫
4. 避免只在「偵測成功分支」才註冊 cleanup
5. 需要時改用同步輸出通道（避免 process 結束前 flush 丟失）

### 9.4 驗收條件
1. `issue26-manual-capture.sh` 在使用者真機重現路徑下，`summary.json`：
   - `tty_pollution_suspected=false`
   - `enter_value in {0d,0a}`
   - `tab_value == 09`
   - `ctrl_interrupted=true`, `ctrl_done=false`
2. transcript 不再出現 post-exit `^[[...` leak pattern（或顯著下降）

---

## 10) 建議後續流程（下一位 Agent 直接照做）
1. 先跑基線：
```bash
node scripts/issue26-tty-repro.js --out-dir /tmp/issue26-tmux-baseline
```
2. 套修補（terminal cleanup）
3. 跑自動回歸：
```bash
node scripts/issue26-tty-repro.js --out-dir /tmp/issue26-tmux-after-fix
```
4. 請使用者跑真機採證：
```bash
scripts/issue26-manual-capture.sh --out-dir /tmp/issue26-manual-after-fix
```
5. 以 `summary.json` 決策是否關單

---

## 11) asciinema 建議
可作為「人工可讀補充證據」，但不是主判讀來源。

推薦方式：
```bash
asciinema rec /tmp/issue26.cast --command "scripts/issue26-manual-capture.sh --out-dir /tmp/issue26-manual-asciinema"
```

主證據仍以：
- `summary.json`
- `stty.before/after`
- `session.typescript`

---

## 12) 本輪相關 bd issue
- `llxprt-code-jq0`（已完成）：建立 tmux/pty 重現與報告流程
- `llxprt-code-2nx`（本文件）：整體交接文件整理與後續計畫
