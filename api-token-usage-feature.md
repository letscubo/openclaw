# OpenAI 兼容 API Token 使用量返回功能

## 概述

本次修改为 OpenClaw 的 OpenAI 兼容 API (`/v1/chat/completions`) 添加了真实的 token 使用量返回功能。之前 API 返回的 `usage` 字段是硬编码的 `0`，现在会返回每次对话的实际 token 消耗。

## 修改文件

- `src/gateway/openai-http.ts`

## 修改步骤

### 步骤 1：添加类型定义

在文件中添加了以下类型定义：

```typescript
// Agent 命令返回结果类型
type AgentCommandResult = {
  payloads?: Array<{ text?: string }>;
  meta?: {
    agentMeta?: {
      usage?: {
        input?: number;
        output?: number;
        cacheRead?: number;
        cacheWrite?: number;
        total?: number;
      };
    };
  };
};

// OpenAI 格式的 usage 类型
type OpenAiUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};
```

### 步骤 2：添加 usage 提取函数

添加了 `extractUsageFromResult` 函数，用于从 agent 运行结果中提取 usage 信息并转换为 OpenAI 格式：

```typescript
function extractUsageFromResult(result: AgentCommandResult | null): OpenAiUsage {
  const usage = result?.meta?.agentMeta?.usage;
  if (!usage) {
    return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  }
  // prompt_tokens = input + cacheRead + cacheWrite (遵循 OpenAI 约定)
  const promptTokens = (usage.input ?? 0) + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0);
  const completionTokens = usage.output ?? 0;
  const totalTokens = usage.total ?? promptTokens + completionTokens;
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
  };
}
```

### 步骤 3：修改非流式响应

修改非流式（`stream: false`）响应，从 `agentCommand` 返回结果中提取真实 usage：

**修改前：**
```typescript
usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
```

**修改后：**
```typescript
const typedResult = result as AgentCommandResult | null;
const usage = extractUsageFromResult(typedResult);
// ... 在响应中使用 usage
```

### 步骤 4：修改流式响应

修改流式（`stream: true`）响应，在最终的 chunk 中包含 usage 信息：

```typescript
// 发送包含 finish_reason 和 usage 的最终 chunk
const usage = extractUsageFromResult(streamResult);
writeSse(res, {
  id: runId,
  object: "chat.completion.chunk",
  created: Math.floor(Date.now() / 1000),
  model,
  choices: [
    {
      index: 0,
      delta: {},
      finish_reason: "stop",
    },
  ],
  usage,
});
```

## Token 字段映射

| OpenClaw 内部字段 | OpenAI 格式字段 | 说明 |
|------------------|----------------|------|
| `input` | `prompt_tokens` (部分) | 输入 token |
| `cacheRead` | `prompt_tokens` (部分) | 缓存读取 token |
| `cacheWrite` | `prompt_tokens` (部分) | 缓存写入 token |
| `output` | `completion_tokens` | 输出 token |
| `total` | `total_tokens` | 总 token |

计算公式：
- `prompt_tokens = input + cacheRead + cacheWrite`
- `completion_tokens = output`
- `total_tokens = total` (如果存在) 或 `prompt_tokens + completion_tokens`

## API 响应示例

### 非流式响应

```json
{
  "id": "chatcmpl_xxx",
  "object": "chat.completion",
  "created": 1706000000,
  "model": "openclaw",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "..." },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 150,
    "completion_tokens": 50,
    "total_tokens": 200
  }
}
```

### 流式响应

最终 chunk 将包含 usage 信息：

```json
{
  "id": "chatcmpl_xxx",
  "object": "chat.completion.chunk",
  "created": 1706000000,
  "model": "openclaw",
  "choices": [
    {
      "index": 0,
      "delta": {},
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 150,
    "completion_tokens": 50,
    "total_tokens": 200
  }
}
```

## 使用方式

调用 `/v1/chat/completions` API 时，响应中的 `usage` 字段将包含真实的 token 使用量：

```bash
curl -X POST http://localhost:18789/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "model": "openclaw",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

## 注意事项

1. 如果 agent 未返回 usage 信息，API 将返回全 0 的 usage
2. 流式响应的 usage 在最后一个 chunk（`finish_reason: "stop"`）中返回
3. 此功能与 OpenAI API 的行为保持一致
