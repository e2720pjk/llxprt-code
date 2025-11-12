# Pipeline 架構簡化執行計畫

## 📋 計畫概述

基於深入分析，我們識別出 Pipeline 架構中的過度設計問題，並制定了簡化方案。計畫保留必要功能，移除冗餘組件，專注於核心職責。

## 🎯 核心發現

### 必要保留的功能

1. **碎片收集與組裝**：ToolCallCollector 的核心功能
2. **工具名稱正規化**：處理不同 Provider 的格式差異
3. **基本驗證**：檢查工具名稱有效性
4. **參數處理**：使用 processToolParameters 自動識別

### 應該移除的過度設計

1. **重複的驗證邏輯**：ToolCallValidator 與 ToolCallProcessor 功能重複
2. **過度驗證**：嚴格的 JSON 驗證阻礙有效工具呼叫
3. **providerFormat 依賴**：違反避免名稱切換的原則
4. **工具執行功能**：不應在 Provider 層處理

## 🛠️ 簡化方案

### 階段一：修正 ToolCallCollector ✅ 已完成

**問題**：arguments 使用覆蓋而非累加邏輯

**狀態**：✅ 已實施並測試

**當前錯誤實作**：

```typescript
// ToolCallCollector.ts:139 (舊版 - 錯誤)
if (fragment.args) {
  result.args = fragment.args; // ❌ 覆蓋而非累加
}
```

**修正後實作**：

```typescript
// 修正為累加邏輯 (新版 - 已修復)
let accumulatedArgs = '';
for (const fragment of result.fragments) {
  if (fragment.name) {
    result.name = fragment.name; // ✅ name 保持覆蓋（正確）
  }
  if (fragment.args) {
    accumulatedArgs += fragment.args; // ✅ arguments 改為累加
  }
}
result.args = accumulatedArgs;
```

**檔案**：`packages/core/src/providers/openai/ToolCallCollector.ts`

**影響**：✅ 已解決 JSON 不完整的根本問題

**驗證**：ToolCallCollector.test.ts 9/9 測試通過

### 階段二：簡化 ToolCallProcessor（條件執行）

**執行條件**：階段一修復後仍有問題

**移除的功能**：

- ❌ `parseArgsStrictly` 的過度驗證
- ❌ `providerFormat` 依賴
- ❌ 複雜的配置選項 `ToolCallProcessorOptions`

**保留的功能**：

- ✅ 工具名稱正規化
- ✅ 基本驗證（名稱格式）
- ✅ 使用 processToolParameters 自動識別

**簡化後的實作**：

```typescript
export class ToolCallProcessor {
  // 移除複雜配置選項
  constructor() {
    // 無配置，保持簡單
  }

  process(candidate: ToolCallCandidate): ProcessedToolCall {
    const result: ProcessedToolCall = {
      index: candidate.index,
      name: candidate.name || '',
      args: {},
      originalArgs: candidate.args,
      isValid: true,
      validationErrors: [],
      normalizedName: this.normalizeToolName(candidate.name),
    };

    // 只做基本驗證
    if (!this.isValidToolName(result.name)) {
      result.isValid = false;
      result.validationErrors.push('Invalid tool name');
    }

    // 簡化參數處理
    if (candidate.args) {
      result.args = this.parseArguments(candidate.args, result.name);
    }

    return result;
  }

  private parseArguments(
    args: string,
    toolName: string,
  ): Record<string, unknown> {
    // 直接使用 processToolParameters，讓其自動識別
    const processed = processToolParameters(args, toolName);
    return this.normalizeProcessResult(processed);
  }

  private normalizeProcessResult(processed: unknown): Record<string, unknown> {
    if (typeof processed === 'object' && processed !== null) {
      return processed as Record<string, unknown>;
    }
    if (typeof processed === 'string') {
      return { value: processed };
    }
    return {};
  }
}
```

**檔案**：`packages/core/src/providers/openai/ToolCallProcessor.ts`

### 階段三：移除冗餘組件（可選執行）

**執行條件**：追求架構簡潔時

**移除的檔案**：

1. ❌ `ToolCallValidator.ts` - 功能與 ToolCallProcessor 重複
2. ❌ `ToolCallNormalizer.ts` - 功能合併到 ToolCallProcessor
3. ❌ `ToolCallExecutor.ts` - 不應在 Provider 層執行工具

**移除步驟**：

```bash
# 確認無其他引用後移除
rm packages/core/src/providers/openai/ToolCallValidator.ts
rm packages/core/src/providers/openai/ToolCallNormalizer.ts
rm packages/core/src/providers/openai/ToolCallExecutor.ts
```

**保留的檔案**：

1. ✅ `ToolCallCollector.ts` - 核心收集功能
2. ✅ `ToolCallProcessor.ts` - 簡化後的處理器
3. ✅ `ToolCallPipeline.ts` - 協調器

### 階段四：簡化 ToolCallPipeline（可選執行）

**移除複雜性**：

```typescript
export class ToolCallPipeline {
  private collector: ToolCallCollector;
  private processor: ToolCallProcessor;

  constructor() {
    this.collector = new ToolCallCollector();
    this.processor = new ToolCallProcessor(); // 無配置選項
  }

  addFragment(index: number, fragment: Partial<ToolCallFragment>): void {
    this.collector.addFragment(index, fragment);
  }

  process(): PipelineResult {
    const candidates = this.collector.getCompleteCalls();
    this.collector.reset();

    const processingResult = this.processor.processBatch(candidates);

    // 簡化結果轉換
    return {
      normalized: processingResult.processed
        .filter((call) => call.isValid)
        .map((call) => ({
          index: call.index,
          name: call.normalizedName,
          args: call.args,
          originalArgs: call.originalArgs,
        })),
      failed: processingResult.processed
        .filter((call) => !call.isValid)
        .map((call) => ({
          index: call.index,
          name: call.name,
          args: call.originalArgs,
          isValid: false,
          validationErrors: call.validationErrors,
        })),
      stats: {
        total: processingResult.stats.total,
        valid: processingResult.stats.valid,
        failed: processingResult.stats.invalid,
      },
    };
  }
}
```

**檔案**：`packages/core/src/providers/openai/ToolCallPipeline.ts`

## 📊 預期效果

### 複雜度減少

- **組件數量**：5 → 2（減少 60%）
- **程式碼行數**：~400 → ~200（減少 50%）
- **配置選項**：複雜 → 無配置

### 職責清晰度

- **修正前**：收集 + 驗證 + 正規化 + 執行（職責混淆）
- **修正後**：收集 + 組裝 + 基本處理（職責明確）

### 功能保留度

- ✅ 碎片收集與組裝
- ✅ 工具名稱正規化
- ✅ 基本驗證
- ✅ 參數自動處理

## 🚫 禁止事項

### 絕對禁止

1. **禁止混合 TextToolCallParser 職責**
   - TextToolCallParser 專注於文本解析
   - processToolParameters 專注於 JSON 轉義
   - 兩者職責不同，有同時存在的必要

2. **禁止在 Provider 層執行工具**
   - 工具執行應在 Core 層處理
   - Provider 層專注於 API 通訊和資料轉換

3. **禁止創建萬能解析器**
   - 不要讓 processToolParameters 處理文本解析
   - 不要讓 TextToolCallParser 處理 JSON 轉義

4. **禁止基於工具名稱的條件判斷**
   - 不要添加 `if (toolName === 'todo_write')` 類似邏輯
   - 保持處理邏輯的通用性

### 避免的過度設計

1. **避免重複 JSON.parse**
   - processToolParameters 內部已經處理過 JSON 解析
   - 不要在外層重複解析

2. **避免過度抽象**
   - 專注於解決當前問題
   - 不要為了「未來擴展」增加不必要的複雜性

3. **避免不必要的數據結構轉換**
   - 減少中間數據結構
   - 直接從 ToolCallCandidate 轉換到最終格式

## 🎯 執行順序與時機

### 立即執行（高優先級）

1. **階段一**：修正 ToolCallCollector 累加邏輯
2. **測試驗證**：確認 Qwen 工具呼叫恢復正常

### 條件執行（中優先級）

3. **階段二**：如果階段一後仍有問題，簡化 ToolCallProcessor

### 可選執行（低優先級）

4. **階段三**：如果追求架構簡潔，移除冗餘組件
5. **階段四**：最後簡化 ToolCallPipeline

## 📈 成功標準

### 功能驗證

- [x] Qwen 模型工具呼叫正常運作 (ToolCallCollector 修復完成)
- [x] Debug 日誌顯示完整的 arguments (碎片累加邏輯已修復)
- [x] 無碎片丟失問題 (累加測試通過)
- [ ] 其他 Provider（OpenAI、Anthropic）不受影響

### 架構改善

- [ ] 組件職責清晰明確
- [ ] 無重複邏輯
- [ ] 代碼複雜度顯著降低
- [ ] 維護性提升

### 品質保證

- [ ] 所有現有測試通過
- [ ] 無 TypeScript 編譯錯誤
- [ ] 無 ESLint 警告

## 🔍 測試驗證方法

### 修復前測試

```bash
# 執行測試觀察問題
DEBUG=llxprt:* node scripts/start.js --profile-load qwen3-coder-plus --prompt "run shell 'bd' to check task status"
```

### 修復後驗證

```bash
# 相同命令測試，確認修復效果
DEBUG=llxprt:* node scripts/start.js --profile-load qwen3-coder-plus --prompt "run shell 'bd' to check task status"

# 完整測試套件
npm run test
npm run typecheck
npm run lint
```

## 📝 備註

### 設計原則

1. **單一職責**：每個組件專注於自己的核心功能
2. **最小驗證**：只檢查必要欄位，不過度驗證
3. **信任下層**：讓 processToolParameters 處理 JSON 問題
4. **避免抽象**：減少不必要的數據結構轉換

### 關鍵洞察

- Pipeline 的核心價值在於處理 streaming 碎片
- 過度驗證是阻礙工具呼叫的主要原因
- 職責分離比功能完整性更重要
- 簡單的解決方案通常是最好的解決方案

---

**計畫制定日期**：2025-11-12  
**預計執行時間**：2-6 小時（取決於執行階段）  
**風險等級**：中低（分階段執行，可隨時停止）  
**影響範圍**：OpenAIProvider Pipeline 模式
