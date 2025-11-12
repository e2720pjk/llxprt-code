# Pipeline 問題測試文檔

本文檔描述了為解決 ToolCall Pipeline 中的兩個關鍵問題而創建的測試。

## 問題概述

### 問題一：ToolCallCollector 碎片累加錯誤

**根本原因**：`ToolCallCollector` 的 `assembleCall` 方法使用覆蓋邏輯而非累加邏輯來處理 arguments 碎片。

**影響**：當 Qwen 模型將 JSON 參數分片發送時，只有最後一個碎片被保留，導致 JSON 不完整。

**修復**：將 arguments 處理改為累加邏輯。

### 問題二：processToolParameters 字串返回值處理錯誤

**根本原因**：當 `processToolParameters` 返回字串時（表示無法解析 JSON），被錯誤地視為失敗並返回 null。

**影響**：有效但無法解析的參數被丟棄，工具呼叫失敗。

**修復**：將字串返回值包裝為 `{ value: string }` 並繼續執行工具。

## 創建的測試

### 1. ToolCallCollector.test.ts - 問題一測試

**位置**：`packages/core/src/providers/openai/ToolCallCollector.test.ts`

**新增測試**：

- `should correctly accumulate arguments fragments`：驗證碎片正確累加
- `should handle arguments split across multiple fragments`：測試累加邏輯
- `should accumulate empty args correctly`：測試空參數處理
- `should handle name fragments correctly (last name wins)`：驗證名稱覆蓋邏輯

**測試場景**：

```typescript
// 模擬 Qwen streaming 碎片
collector.addFragment(0, { name: 'test_tool' });
collector.addFragment(0, { args: '{"param1": ' });
collector.addFragment(0, { args: '"value1", ' });
collector.addFragment(0, { args: '"param2": ' });
collector.addFragment(0, { args: '"value2"}' });

// 預期結果：完整的 JSON 字串
expect(completeCalls[0].args).toBe('{"param1": "value1", "param2": "value2"}');
```

### 2. ToolCallNormalizer.test.ts - 問題二測試

**位置**：`packages/core/src/providers/openai/ToolCallNormalizer.test.ts`

**測試內容**：

- `should handle processToolParameters returning object correctly`：測試正常物件返回值
- `should handle processToolParameters returning string correctly (Problem 2)`：**關鍵測試**
- `should handle processToolParameters returning null/undefined`：測試異常返回值
- `should handle empty args correctly`：測試空參數
- `should handle undefined args correctly`：測試未定義參數

**關鍵測試場景**：

```typescript
// 模擬 processToolParameters 返回字串
vi.mocked(processToolParameters).mockReturnValue('some string result');

// 驗證結果被包裝為 { value: string }
expect(result?.args).toEqual({ value: 'some string result' });
```

### 3. ToolCallPipeline.integration.test.ts - 集成測試

**位置**：`packages/core/src/providers/openai/ToolCallPipeline.integration.test.ts`

**測試內容**：

- `should handle fragmented JSON arguments correctly (Problem 1 fix)`：端到端碎片處理
- `should handle processToolParameters returning string (Problem 2 fix)`：端到端字串處理
- 多個工具呼叫並發處理
- 錯誤處理和恢復
- Qwen 特定場景（雙重轉義）

**集成測試優勢**：

- 測試完整 Pipeline 流程
- 驗證各組件間的交互
- 模擬實際 streaming 場景

## 測試執行方式

### 單獨運行特定測試

```bash
# 問題一測試
npm test -- --run ToolCallCollector.test.ts

# 問題二測試
npm test -- --run ToolCallNormalizer.test.ts

# 集成測試
npm test -- --run ToolCallPipeline.integration.test.ts
```

### 運行所有 Pipeline 相關測試

```bash
npm test -- --run "*ToolCall*"
```

### 驗證修復效果

```bash
# 修復前：會看到工具呼叫失敗
DEBUG=llxprt:* node scripts/start.js --profile-load qwen3-coder-plus --prompt "run shell 'bd' to check task status"

# 修復後：工具呼叫應該成功
DEBUG=llxprt:* node scripts/start.js --profile-load qwen3-coder-plus --prompt "run shell 'bd' to check task status"
```

## 測試設計原則

### 1. 不依賴實際 API 呼叫

所有測試都是單元測試或模擬集成測試，不需要實際的 OpenAI API 呼叫。

### 2. 模擬實際場景

測試使用與實際 Qwen 模型輸出相似的碎片模式。

### 3. 驗證修復邏輯

測試專注於驗證問題的根本原因和修復效果。

### 4. 覆蓋邊界情況

測試包括正常情況、錯誤情況和邊界情況。

## 測試結果驗證

### 問題一修復驗證

- ✅ 碎片正確累加為完整 JSON
- ✅ JSON 可以成功解析
- ✅ 工具接收正確參數

### 問題二修復驗證

- ✅ 字串返回值被包裝為 `{ value: string }`
- ✅ 工具仍然成功執行
- ✅ 不會意外失敗

### 回歸測試

- ✅ 所有現有測試通過
- ✅ 無功能破壞
- ✅ 性能無顯著影響

## 相關文件

- [TOOLCALL_PIPELINE_ANALYSIS_REPORT.md](./TOOLCALL_PIPELINE_ANALYSIS_REPORT.md) - 問題分析報告
- [PIPELINE_SIMPLIFICATION_PLAN.md](./PIPELINE_SIMPLIFICATION_PLAN.md) - 簡化執行計畫
- [PIPELINE_LEGACY_INTEGRATION_REPORT.md](./PIPELINE_LEGACY_INTEGRATION_REPORT.md) - 整合分析報告

## 結論

這些測試成功驗證了兩個關鍵問題的修復：

1. **碎片累加問題**：ToolCallCollector 現在正確累加 arguments 碎片
2. **字串返回值處理**：processToolParameters 的字串返回值現在被正確處理

測試確保了修復的有效性，同時維持了向後兼容性和系統穩定性。
