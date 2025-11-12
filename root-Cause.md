Root Cause

OpenAI/Qwen streaming now flows through ToolCallPipeline (packages/core/src/providers/
openai/OpenAIProvider.ts:2390), which feeds every delta.tool_calls[].function.arguments
chunk into ToolCallValidator.
ToolCallValidator (packages/core/src/providers/openai/ToolCallValidator.ts:65) rejects any
arguments that are not valid JSON. Qwen’s “autonomous” prompt style emits plain text lists
for todo_write (e.g., “1. analyze architecture…”), not JSON.
Previously, non-JSON todo_write output was still rescued by the text-buffer parser(TextToolCallParser, packages/core/src/parsers/TextToolCallParser.ts:600), which could
convert the textual <tool_call> block into structured arguments. The new pipeline short-
circuits before that fallback: the collector assembles a tool call, the validator tries to
JSON.parse the raw text, fails, logs the error (~/.llxprt/debug/llxprt-debug-2025-11-10-14-
38-08.jsonl:267), and drops the call.
Because every todo_write call now fails validation, the model keeps receiving “Tool call
validation failed…” messages, never sees the todo tool execute, and keeps re-promising to
build a list—hence the user experience reported in issue #518.

Next Steps

Teach the pipeline to tolerate non-JSON arguments for legacy/Qwen formats: e.g., pass
the text through TextToolCallParser before validation or allow provider-specific argument
normalizers.
Only enforce strict JSON when the provider advertises argumentsFormat=json;
otherwise, attempt best-effort parsing (perhaps via the existing
TextToolCallParser.normalizeTodoEntry helpers) before rejecting.
Once a workable normalization exists, add regression coverage (e.g., an integration test
that feeds a Qwen-style plain-text todo_write call and ensures the validator accepts it).

• - The failure is upstream of normalizeTodoEntry. That helper (packages/core/src/parsers/
TextToolCallParser.ts:628) only runs after we already have a parsed JSON object. In this
regression the stream never reaches that stage: ToolCallValidator.isValidArgs() (packages/
core/src/providers/openai/ToolCallValidator.ts:65) attempts JSON.parse on whatever
delta.tool_calls[].function.arguments we just buffered. Qwen still emits plain text for
todo_write (think “1. look at the project structure…”), so validation throws immediately
and the pipeline drops the call before any tool-specific normalization or /toolformat qwen
fallback can run.

/toolformat qwen used to help because the old flow let the raw text fall through to
TextToolCallParser.parse() after the assistant finished streaming a block. The new
collector/validator short-circuits as soon as it thinks it has a complete tool call, so the
text parser never fires. That’s why it “feels like arrays”: Qwen is simply not sending JSON
arrays, and now we reject the text instead of tolerating it.
The “todo promises” are visible in the runtime log. Example: ~/.llxprt/debug/llxprt-
debug-2025-11-10-14-38-08.jsonl:358 captures the bot replying “I'll examine the codebase
architecture thoroughly…”; :651 shows the same answer recycled plus the user’s “write a
todolist…” command. Every subsequent attempt ends with Tool call validation failed: Tool
call arguments are not valid JSON (e.g., :705, :769, :1013, :1160). Because each todo_write
fragment dies in validation, history only records those repeated promises—no todo list ever
gets created.

So the actionable fix is to teach ToolCallPipeline to run non-JSON payloads through the
existing text parser (or otherwise coerce Qwen’s format) before isValidArgs rejects them, not
to tweak normalizeTodoEntry.
