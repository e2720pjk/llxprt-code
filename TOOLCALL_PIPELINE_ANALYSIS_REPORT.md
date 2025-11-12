# ToolCall Pipeline 問題分析與解決報告

## 📋 執行摘要

本報告詳細記錄了 Qwen 模型在 Pipeline 模式下工具呼叫無法正確觸發問題的完整調查過程，包括問題發現、根因分析、解決方案制定及實施建議。

**關鍵發現**：問題根源在於 ToolCallCollector 的碎片累加邏輯錯誤，導致 JSON 參數不完整，進而影響後續處理。

---

## 1. 問題發現與證據收集

### 1.1 初始問題現象

#### 測試命令

```bash
DEBUG=llxprt:* node scripts/start.js --profile-load qwen3-coder-plus --prompt "run shell 'bd' to check task status"
```

#### 觀察到的問題

- Qwen 模型在 Pipeline 模式下無法觸發工具呼叫
- Legacy 模式運作正常
- Debug 日誌顯示工具參數處理失敗

### 1.2 Debug 記錄分析

#### 關鍵日誌片段

```json
{"timestamp":"2025-11-12T13:58:12.568Z","namespace":"llxprt:provider:openai","level":"debug","message":"[OpenAIProvider] Exact tools being sent to API:","args":[{"toolCount":16,"toolNames":["delete_line_range","glob","google_web_search","insert_at_line","list_subagents","read_file","list_directory","read_line_range","read_many_files","save_memory","search_file_content","task","todo_pause","todo_read","todo_write","web_fetch"],"firstTool":{"type":"function","function":{"name":"delete_line_range","description":"Deletes a specific range of lines from a file. This is the preferred way to delete large blocks, as it avoids using a massive, brittle 'old_string' in the 'replace' tool. Always read the file or use 'get_file_outline' first to get the exact line numbers before deleting.","parameters":{"properties":{"absolute_path":{"description":"The absolute path to the file to modify. Must start with '/' and be within the workspace.","type":"string"},"start_line":{"description":"The 1-based line number to start deleting from (inclusive).","type":"number","minimum":1},"end_line":{"description":"The 1-based line number to end deleting at (inclusive). Must be >= start_line.","type":"number","minimum":1}},"required":["absolute_path","start_line","end_line"],"type":"object"}}}}]}
{"timestamp":"2025-11-12T13:58:14.254Z","namespace":"llxprt:providers:openai:toolCallCollector","level":"debug","message":"ToolCallCollector reset"}
{"timestamp":"2025-11-12T13:58:14.254Z","namespace":"llxprt:providers:openai:toolCallPipeline","level":"debug","message":"ToolCallPipeline reset"}
```

**分析結果**：

- 工具正確發送到 API（16 個工具）
- Pipeline 正確重置，但沒有收集到任何工具呼叫
- 說明問題在於工具呼叫的收集和處理階段

### 1.3 Git Diff 分析

#### 主要變更內容

```diff
-  private readonly toolCallPipeline = new ToolCallPipeline();
+  private readonly toolCallPipeline: ToolCallPipeline;
+  const toolFormat = this.detectToolFormat();
+  const isQwenFormat = toolFormat === 'qwen' || toolFormat === 'gemma';
+  this.toolCallPipeline = new ToolCallPipeline({
+    providerFormat: toolFormat,
+    strictJsonValidation: !isQwenFormat,
+  });
```

**發現**：最近的變更引入了基於格式的嚴格驗證邏輯。

---

## 2. 根因分析與實際情況

### 2.1 三個獨立問題的識別

#### 問題一：ToolCallCollector 碎片累加錯誤（根本原因）

**證據**：

```typescript
// ToolCallCollector.ts:139 - 錯誤實作
private assembleCall(index: number, fragments: ToolCallFragment[]): ToolCallCandidate | null {
  // ...
  for (const fragment of result.fragments) {
    if (fragment.name) {
      result.name = fragment.name; // ✅ name 正確使用覆蓋
    }
    if (fragment.args) {
      result.args = fragment.args; // ❌ arguments 錯誤使用覆蓋
    }
  }
}
```

**對比 Legacy 模式**：

```typescript
// OpenAIProvider.ts:1537 - 正確實作
if (deltaToolCall.function?.arguments) {
  tc.function.arguments += deltaToolCall.function.arguments; // ✅ 正確累加
}
```

**影響分析**：

- Pipeline 模式：只保留最後一個 arguments 片段，導致 JSON 不完整
- Legacy 模式：正確累加所有片段，得到完整 JSON

#### 問題二：ToolCallProcessor 過度嚴格驗證與格式依賴（放大器）

**證據**：

```typescript
// ToolCallProcessor.ts:115-121
if (this.options.providerFormat === 'qwen') {
  const processed = processToolParameters(args, 'unknown_tool', 'qwen');
  // If processing returned a string, it means parsing failed
  if (typeof processed === 'string') {
    return null; // ❌ 錯誤：將有效參數視為失敗
  }
  return processed as Record<string, unknown>;
}
```

**問題分析**：

- `processToolParameters` 可能返回處理後的有效字串參數
- 當前邏輯錯誤地將任何字串返回值視為失敗
- 過度依賴 `providerFormat` 進行條件判斷，違反「避免依賴名稱切換」原則
- `parseArgsStrictly` 存在過度驗證，與 `processToolParameters` 職責重複

**討論共識**：

- 讓 `processToolParameters` 自動識別問題，不依賴 format 參數
- 可以拿掉 `parseArgsStrictly`，避免重複驗證邏輯
- TextToolCallParser 與 processToolParameters 職責不同，不應混合處理

#### 問題三：過度依賴 providerFormat（設計缺陷）

**證據**：

```typescript
// 多處基於格式判斷的邏輯
if (this.options.providerFormat === 'qwen') {
  // 特殊處理邏輯
}
```

**設計問題**：

- 違反了「避免依賴名稱切換處理」的原則
- 增加了代碼複雜性和維護成本
- 不利於未來擴展

**討論共識**：

- 應該讓 `processToolParameters` 自動識別，避免基於名稱的切換
- 保持各工具職責清晰，不創建萬能解析器
- 避免過度設計，專注於解決當前問題

### 2.2 問題關聯性分析

#### 影響鏈

```
問題一（累加錯誤）→ JSON 不完整 → processToolParameters 解析失敗 → 問題二（過度驗證）放大問題 → 工具呼叫完全失敗
```

#### 優先級評估

1. **問題一**：根本原因，必須修復
2. **問題二**：放大器，修復後可提高容錯性
3. **問題三**：設計缺陷，影響長期維護性

---

## 3. 解決方案報告

### 3.1 修復策略總覽

#### 階段一：修復問題一（必須立即執行）

**目標**：修正 ToolCallCollector 的碎片累加邏輯

**方案**：直接修正累加邏輯

```typescript
// 修正前
if (fragment.args) {
  result.args = fragment.args; // 覆蓋
}

// 修正後
let accumulatedArgs = '';
for (const fragment of result.fragments) {
  if (fragment.name) {
    result.name = fragment.name; // 保持覆蓋
  }
  if (fragment.args) {
    accumulatedArgs += fragment.args; // 改為累加
  }
}
result.args = accumulatedArgs;
```

#### 階段二：評估問題二（條件性執行）

**目標**：讓 processToolParameters 自動識別問題，移除 parseArgsStrictly

**執行條件**：階段一修復後仍有問題

**方案**：讓 processToolParameters 自動識別，移除過度驗證

**步驟 2.1：修改 processToolParameters，移除 format 依賴**

```typescript
// doubleEscapeUtils.ts - 修改 processToolParameters
export function processToolParameters(
  parametersString: string,
  toolName: string,
  format?: string, // 改為可選，避免依賴名稱切換
): unknown {
  if (!parametersString.trim()) {
    return {};
  }

  // 嘗試多種解析策略，不依賴 format
  return tryMultipleParsingStrategies(parametersString, toolName);
}

function tryMultipleParsingStrategies(
  parametersString: string,
  toolName: string,
): unknown {
  // 策略 1: 直接 JSON 解析
  try {
    return JSON.parse(parametersString);
  } catch {}

  // 策略 2: 檢測並修復雙重轉義（現有邏輯，不依賴 format）
  const detection = detectDoubleEscaping(parametersString);
  if (detection.correctedValue !== undefined) {
    return detection.correctedValue;
  }

  // 策略 3: 返回原始字串（最後手段）
  return parametersString;
}
```

**步驟 2.2：移除 parseArgsStrictly，直接使用 processToolParameters**

```typescript
// ToolCallProcessor.ts - 移除 parseArgsStrictly，簡化邏輯
private parseArgs(args: string): Record<string, unknown> | null {
  if (!args || !args.trim()) {
    return {};
  }

  // 直接使用 processToolParameters，讓其自動識別
  const processed = processToolParameters(args, this.actualToolName);

  // 直接信任 processToolParameters 的結果，避免重複處理
  if (typeof processed === 'object' && processed !== null) {
    return processed as Record<string, unknown>;
  }

  if (typeof processed === 'string') {
    return { value: processed };
  }

  return null;
}
```

**核心原則**：

- 讓 processToolParameters 自動識別和處理 JSON 問題
- 移除 parseArgsStrictly 的過度驗證邏輯
- 避免重複 JSON.parse（processToolParameters 內部已處理）
- 不依賴 providerFormat 進行條件判斷

#### 階段三：決策問題三（可選執行）

**目標**：完全移除 providerFormat 依賴

**執行條件**：階段二執行後，追求架構完美時

**方案**：統一處理邏輯，完全自動識別

```typescript
// ToolCallProcessor.ts - 完全移除格式依賴
constructor(options: ToolCallProcessorOptions = {}) {
  this.options = {
    // 移除 strictJsonValidation 和 providerFormat
    ...options,
  };
}

private parseArgs(args: string): Record<string, unknown> | null {
  if (!args || !args.trim()) {
    return {};
  }

  // 完全依賴 processToolParameters 的自動識別
  const processed = processToolParameters(args, this.actualToolName);
  return normalizeToRecord(processed);
}
```

**核心原則**：

- 完全移除基於 providerFormat 的條件判斷
- 讓 processToolParameters 處理所有格式識別
- 實現真正的「避免依賴名稱切換」

### 3.2 詳細實施計畫

#### 步驟 1：修復 ToolCallCollector

**檔案**：`packages/core/src/providers/openai/ToolCallCollector.ts`

**具體修改**：

```typescript
private assembleCall(
  index: number,
  fragments: ToolCallFragment[],
): ToolCallCandidate | null {
  const result: ToolCallCandidate = {
    index,
    fragments: [...fragments].sort((a, b) => a.timestamp - b.timestamp),
  };

  // 修正：正確累加 arguments
  let accumulatedArgs = '';
  for (const fragment of result.fragments) {
    if (fragment.name) {
      result.name = fragment.name; // name 保持覆蓋邏輯
    }
    if (fragment.args) {
      accumulatedArgs += fragment.args; // arguments 改為累加邏輯
    }
  }
  result.args = accumulatedArgs;

  if (!result.name) {
    logger.error(`Assembled tool call ${index} missing name`);
    return null;
  }

  logger.debug(`Assembled complete tool call ${index}: ${result.name}`);
  return result;
}
```

#### 步驟 2：測試驗證

**測試命令**：

```bash
DEBUG=llxprt:* node scripts/start.js --profile-load qwen3-coder-plus --prompt "run shell 'bd' to check task status"
```

**預期結果**：

- 工具呼叫正確觸發
- Debug 日誌顯示完整的 arguments
- 無碎片丟失

#### 步驟 3：回歸測試

**測試套件**：

```bash
npm run test
npm run typecheck
npm run lint
```

#### 步驟 4：條件性後續修復

**評估標準**：

- 如果步驟 2 完全解決問題 → 停止
- 如果仍有部分問題 → 執行問題二修復
- 如果追求架構完美 → 執行問題三修復

### 3.3 風險評估與緩解

#### 風險識別

1. **低風險**：問題一修復範圍小，邏輯明確
2. **中風險**：問題二可能影響其他 Provider
3. **高風險**：問題三變更範圍較大

#### 緩解措施

1. **分階段執行**：逐步修復，每階段充分測試
2. **快速回滾**：保持原始邏輯的備份
3. **充分測試**：每個階段都執行完整測試套件

### 3.4 成功標準

#### 功能驗證

- [ ] Qwen 模型在 Pipeline 模式下工具呼叫正常
- [ ] Debug 日誌顯示完整參數
- [ ] 無碎片丟失問題

#### 品質保證

- [ ] 所有現有測試通過
- [ ] 無 TypeScript 編譯錯誤
- [ ] 無 ESLint 警告
- [ ] 其他 Provider 功能不受影響

#### 架構改善

- [ ] 碎片處理邏輯正確
- [ ] 驗證邏輯合理
- [ ] 代碼複雜性可控

---

## 4. 禁止事項與避免過度設計

### 4.1 絕對禁止的操作

1. **禁止修改 TextToolCallParser**
   - 該工具專注於文本解析，與當前 JSON 參數問題無關
   - 不要混合 JSON 處理和文本解析的職責
   - TextToolCallParser 與 processToolParameters 職責不同，有同時存在的必要

2. **禁止重構 Pipeline 架構**
   - Pipeline 架構本身是正確的，確實有其存在必要性
   - 問題在於實作細節，不在於設計
   - 不要試圖恢復 Legacy 模式的累積邏輯

3. **禁止創建萬能解析器**
   - 不要讓 processToolParameters 處理文本解析
   - 不要讓 TextToolCallParser 處理 JSON 轉義
   - 保持各工具職責清晰

4. **禁止基於工具名稱的條件判斷**
   - 不要添加 `if (toolName === 'todo_write')` 類似邏輯
   - 保持處理邏輯的通用性

### 4.2 避免的過度設計模式

1. **避免讓 processToolParameters 處理文本解析**
   - 這是 TextToolCallParser 的職責
   - 不要混合兩種不同的解析邏輯

2. **避免為了「完整性」增加不必要的複雜性**
   - 專注於解決 Qwen 雙重轉義問題
   - 不要試圖解決所有可能的格式問題

3. **避免重複 JSON.parse**
   - processToolParameters 內部已經處理過 JSON 解析
   - 不要在外層重複解析，這會導致錯誤

4. **避免混合不同層級的職責**
   - Provider 層專注於 API 通訊和資料轉換
   - Core 層專注於工具執行和業務邏輯
   - 不要跨越層級邊界

---

## 5. 結論與建議

### 5.1 關鍵洞察

1. **問題一本質**：是實作錯誤而非設計錯誤
2. **Pipeline 價值**：架構正確，確實有其存在必要性，處理碎片化工具名稱、文本格式工具呼叫、Provider 格式差異
3. **processToolParameters 自動識別**：該函數已具備自動檢測雙重轉義的能力，應讓其發揮作用而不依賴 format 參數
4. **職責分離**：TextToolCallParser 處理自然語言，processToolParameters 處理 JSON 轉義，各有明確職責
5. **修復策略**：應專注於修正錯誤邏輯，讓每個工具做自己的事，避免過度設計

### 5.2 執行建議

1. **立即執行**：修復問題一（碎片累加錯誤）
2. **謹慎評估**：根據修復效果決定是否繼續
3. **避免過度**：不要為了「完美」而增加不必要的複雜性

### 5.3 長期影響

**修復後預期**：

- Qwen 工具呼叫恢復正常
- Pipeline 模式與 Legacy 模式行為一致
- 系統穩定性和可靠性提升

**風險控制**：

- 最小化變更範圍
- 保持向後相容性
- 確保可快速回滾

---

**報告完成日期**：2025-11-12  
**問題嚴重等級**：高（影響核心功能）  
**修復緊急程度**：高（阻礙 Qwen 模型使用）  
**預計修復時間**：2-4 小時（僅問題一）
