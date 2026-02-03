# Usage Webhook Extension

Send LLM model usage data to an external webhook endpoint.

## Configuration

### Environment Variables

| Variable | Description |
|----------|-------------|
| `USAGE_WEBHOOK_URL` | Webhook URL to send usage data |
| `USAGE_WEBHOOK_AUTH_HEADER` | Optional Authorization header value |

### Config File

Add to your `openclaw.json`:

```json
{
  "usageWebhook": {
    "url": "https://your-webhook-endpoint.com/usage",
    "headers": {
      "Authorization": "Bearer your-token"
    },
    "batchSize": 10,
    "flushIntervalMs": 5000,
    "timeoutMs": 10000,
    "maxRetries": 3
  }
}
```

### Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `url` | - | Webhook URL (can also use `USAGE_WEBHOOK_URL` env var) |
| `headers` | `{}` | Additional HTTP headers |
| `batchSize` | `1` | Number of events to batch before sending |
| `flushIntervalMs` | `5000` | Flush interval in milliseconds |
| `timeoutMs` | `10000` | Request timeout in milliseconds |
| `maxRetries` | `3` | Maximum retry attempts on failure |

## Docker Usage

Set the environment variable when starting Docker:

```bash
USAGE_WEBHOOK_URL=https://your-endpoint.com/usage docker compose up
```

Or add to your `.env` file:

```env
USAGE_WEBHOOK_URL=https://your-endpoint.com/usage
USAGE_WEBHOOK_AUTH_HEADER=Bearer your-token
```

## Payload Format

### Single Event

When `batchSize` is 1 (default), each event is sent individually:

```json
{
  "type": "model.usage",
  "timestamp": 1706000000000,
  "sessionKey": "telegram:123456",
  "sessionId": "abc123",
  "channel": "telegram",
  "provider": "anthropic",
  "model": "claude-3-opus",
  "usage": {
    "input": 1500,
    "output": 500,
    "cacheRead": 0,
    "cacheWrite": 0,
    "promptTokens": 1500,
    "total": 2000
  },
  "context": {
    "limit": 200000,
    "used": 2000
  },
  "costUsd": 0.045,
  "durationMs": 3500
}
```

### Batched Events

When `batchSize` > 1, events are batched:

```json
{
  "events": [
    { "type": "model.usage", ... },
    { "type": "model.usage", ... }
  ]
}
```

## Requirements

- Enable diagnostics in your config:

```json
{
  "diagnostics": {
    "enabled": true
  }
}
```
