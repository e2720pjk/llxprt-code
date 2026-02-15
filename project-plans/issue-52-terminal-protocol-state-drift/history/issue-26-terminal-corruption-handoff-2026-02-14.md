# llxprt-code Issue #26 交接文件（2026-02-14）

## 1) 目的
這份文件是給下一位 Agent 的「快速接手包」，聚焦在：
- 已經做過哪些嘗試
- 哪些結論互相矛盾或已被證偽
- 下一輪應該怎麼排查，避免重複踩坑

## 2) 問題定義（目前共識）
Issue #26 的核心現象：
- 在 llxprt 聊天/互動後退出，終端機狀態異常。
- 在中文輸入法情境下，控制鍵/方向鍵可能被當作文字輸入（例如 `^[[A`）。
- 常見恢復方式是切回英文輸入法再執行 `reset`。

已明確出現兩種重現脈絡：
- `CTRL+C` 路徑
- 一般退出路徑（例如：啟動 llxprt -> 輸入 `hi` -> 退出）

關鍵提醒：不要只盯 `SIGINT`（CTRL+C）路徑，因為「一般退出」也有回報失敗。

## 3) 來源與快照（本次整理基準）
抓取時間：2026-02-14（本地彙整）

主要來源：
- Issue #26: [Terminal state corruption: Bell icon and raw input leakage](https://github.com/e2720pjk/llxprt-code/issues/26)
- PR #45: [link](https://github.com/e2720pjk/llxprt-code/pull/45)
- PR #46: [link](https://github.com/e2720pjk/llxprt-code/pull/46)
- PR #47: [link](https://github.com/e2720pjk/llxprt-code/pull/47)
- PR #48: [link](https://github.com/e2720pjk/llxprt-code/pull/48)

本次抽取資料量：
- Issue #26 留言數：31
- 交叉重點留言（含關鍵矛盾）：
  - [#3691510751](https://github.com/e2720pjk/llxprt-code/issues/26#issuecomment-3691510751)
  - [#3691727756](https://github.com/e2720pjk/llxprt-code/issues/26#issuecomment-3691727756)
  - [#3692163098](https://github.com/e2720pjk/llxprt-code/issues/26#issuecomment-3692163098)
  - [PR46 comment #3692118149](https://github.com/e2720pjk/llxprt-code/pull/46#issuecomment-3692118149)
  - [PR48 comment #3693945630](https://github.com/e2720pjk/llxprt-code/pull/48#issuecomment-3693945630)

## 4) 時間線（濃縮版）
- 2025-11-27: Issue #26 建立，回報終端機污染症狀。
- 2025-11-28: 早期方向集中在 Kitty cleanup + signal handlers + `fs.writeSync`。
- 2025-12-25: 開始強調 v0.5.0 與 v0.6.0 差異；同日建立 PR #45、#46。
- 2025-12-25 晚間: 使用者回報 PR #46 實測仍失敗（中文輸入法下問題仍在）。
- 2025-12-26: 建立 PR #47（縮小到 Kitty），仍回報無效。
- 2025-12-27: 建立 PR #48（偏調查與 logging/test scaffolding），又被指出方向偏離核心。
- 截至 2026-02-14: Issue #26 仍開啟，PR #45/#46/#47/#48 皆為 OPEN（未合併）。

## 5) 嘗試矩陣（做過什麼、為什麼不夠）

### PR #45（範圍最大）
- 變更檔案：
  - `packages/cli/src/gemini.tsx`
  - `packages/cli/src/ui/contexts/KeypressContext.tsx`
  - `packages/cli/src/ui/hooks/useBracketedPaste.ts`
  - `packages/cli/src/ui/utils/bracketedPaste.ts`
  - `packages/cli/src/ui/utils/kittyProtocolDetector.ts`
- 核心作法：大量導入 `fs.writeSync`、補 signals、宣稱全面 terminal cleanup。
- 結果：未形成已驗證可收斂的修復；PR 仍 OPEN。

### PR #46（較聚焦 cleanup/signal）
- 變更檔案：
  - `packages/cli/src/ui/contexts/KeypressContext.test.tsx`
  - `packages/cli/src/ui/contexts/KeypressContext.tsx`
  - `packages/cli/src/ui/hooks/useBracketedPaste.ts`
  - `packages/cli/src/ui/utils/bracketedPaste.ts`
  - `packages/cli/src/ui/utils/kittyProtocolDetector.ts`
- 核心作法：維持「sync writes + signal coverage」策略。
- 已知失敗證據：
  - 使用者在 [issue comment #3691726241](https://github.com/e2720pjk/llxprt-code/issues/26#issuecomment-3691726241) 明確回報仍可重現。

### PR #47（只修 Kitty）
- 變更檔案：
  - `packages/cli/src/ui/utils/kittyProtocolDetector.ts`
- 核心作法：僅補 Kitty 的 SIGINT / error handlers 與 sync write。
- 結果：使用者回報仍無效（Issue #26 內後續留言）。

### PR #48（調查導向）
- 變更檔案（PR內容）包含調查文件與測試 scaffold：
  - `TERMINAL_CORRUPTION_INVESTIGATION.md`
  - `integration-tests/terminal-corruption.test.ts`
  - 以及數個 terminal mode 檔案加 logging
- 核心作法：先做 debug logging + reproduction 驗證。
- 結果：方向被指出偏離核心，且有論述矛盾；PR 仍 OPEN。

## 6) 已知矛盾與教訓（重點）

### A. 假設反覆變動，缺少最小驗證閉環
歷史上至少出現三種主假設：
- Kitty/SIGINT/async-write 是主因
- Readline + IME + Ink interaction（引用 Issue #878）是主因
- v0.6.0 引入 raw mode 生命周期回歸（normal exit 未恢復）是主因

教訓：
- 下一輪必須先定義「單一可證偽假設 + 單一重現腳本 + 單一觀測指標」，再改碼。

### B. 一度出現事實錯誤（PR存在性）
在 [PR48 comment #3693945630](https://github.com/e2720pjk/llxprt-code/pull/48#issuecomment-3693945630) 曾聲稱 PR #45/#46/#47 不存在，但實際可由 GitHub 查到這些 PR。

教訓：
- 對 AI 產生的歷史敘述一律做機械驗證（`gh pr view` / `gh issue view`），不要直接相信文字敘述。

### C. 「CTRL+C 修復」不足以覆蓋「一般退出」
多次修復都偏向 signals，但使用者關鍵重現是一般退出也會出問題。

教訓：
- exit path 必須分開驗證：`SIGINT`、`SIGTERM`、normal `/exit`、異常崩潰。

## 7) 目前程式碼觀察（llxprt-code-2 工作樹快照）
以下是本地當前程式碼觀察點，供下一位 Agent 快速定位：

- `packages/cli/src/gemini.tsx:497` 透過 `stdinManager.enable()` 早期開 raw mode。
- `packages/cli/src/gemini.tsx:500`、`packages/cli/src/gemini.tsx:505` 有 `SIGTERM`/`SIGINT` handler。
- `packages/cli/src/gemini.tsx:513` 有 `process.on('exit', ...)` 呼叫 `stdinManager.disable(true)`。

- `packages/cli/src/ui/contexts/KeypressContext.tsx:645` mount 時 `setRawMode(true)`。
- `packages/cli/src/ui/contexts/KeypressContext.tsx:705` cleanup 時以 `wasRaw === false` 條件做 `setRawMode(false)`。

- `packages/cli/src/ui/utils/kittyProtocolDetector.ts:111` 使用 `fs.writeSync` 送檢測序列。
- `packages/cli/src/ui/utils/kittyProtocolDetector.ts:68` 只在 detect 成功路徑註冊 `process.on('exit', disableAllProtocols)`。

- `packages/cli/src/ui/utils/bracketedPaste.ts:11`、`packages/cli/src/ui/utils/bracketedPaste.ts:15` 目前仍是 `process.stdout.write`（非 sync）。
- `packages/cli/src/ui/hooks/useBracketedPaste.ts:27`~`29` 有 `exit`/`SIGINT`/`SIGTERM` cleanup 註冊。

- `packages/cli/src/ui/AppContainer.tsx:795`、`packages/cli/src/ui/AppContainer.tsx:810` 會重送 `ENABLE_FOCUS_TRACKING`。
- `packages/cli/src/ui/AppContainer.tsx:848` 僅在外部 editor open path 送 `DISABLE_FOCUS_TRACKING`。

注意：這裡僅列觀察，不代表已證明根因。

## 8) 下一位 Agent 的最短排查路線（建議）

### Step 1: 先固定可重現條件
至少建立 4 條路徑並記錄 pass/fail：
- 路徑 A: normal exit（`hi` -> `/exit`）
- 路徑 B: `CTRL+C`
- 路徑 C: `SIGTERM`
- 路徑 D: 模擬 exception

每條路徑都要在「中文輸入法」與「英文輸入法」各跑一次。

### Step 2: 只加觀測，不先修
在以下節點打最小 logging（時間戳 + path id）：
- raw mode enable/disable
- kitty enable/disable
- bracketed paste enable/disable
- focus tracking enable/disable
- process exit/signal handler 觸發順序

### Step 3: 用狀態差異判斷根因
最少需比對：
- 退出前/退出後 `stty -a`
- 是否有模式未回復（raw、focus、bracketed、kitty）
- handler 是否有跑但序列沒送達，或根本沒跑

### Step 4: 才進入修復
只針對「已觀測到沒回復」的模式修，並建立對應 regression test。

## 9) 下一輪避免重工清單
- 不要再直接提交「大範圍一口氣修三四個 mode」的 PR。
- 不要只憑 AI 推理判斷 root cause，先做最小可觀測實驗。
- 不要只看 SIGINT；normal exit 一定要納入 acceptance。
- 所有歷史事實（PR 是否存在、是否合併）先用 `gh` 查證。

## 10) 快速資料抓取指令（交接用）
```bash
# Issue 全量（含留言）
gh issue view 26 --repo e2720pjk/llxprt-code --comments \
  --json number,title,state,createdAt,updatedAt,url,body,comments

# PR 快照
for pr in 45 46 47 48; do
  gh pr view "$pr" --repo e2720pjk/llxprt-code \
    --json number,title,state,createdAt,updatedAt,mergedAt,url,files,comments
  echo "----"
done

# 關鍵交叉留言（可快速比對矛盾）
for id in 3691510751 3691727756 3692163098 3692118149 3693945630; do
  gh api repos/e2720pjk/llxprt-code/issues/comments/$id --jq '.html_url,.created_at,.body'
  echo "===="
done
```

## 11) 交接結論
- 歷史上已重複嘗試「補 signals + sync write」，但至少在 PR #46/#47 的回報上未解。
- 真正阻礙是缺少「可重現 + 可觀測 + 可證偽」的單一實驗閉環。
- 下一輪若先建立退出路徑矩陣與 mode-state 觀測，再做單點修復，成功率會顯著高於前幾輪。
