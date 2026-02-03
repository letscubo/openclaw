# LLM Key Manager Extension

HTTP API for real-time LLM key management. This extension allows you to add, update, delete, and list LLM API keys without restarting the gateway.

## Installation

The extension is part of the OpenClaw workspace. To enable it, add the following to your `openclaw.json`:

```json
{
  "extensions": {
    "llm-key-manager": {
      "enabled": true,
      "authToken": "your-secret-token",
      "routePrefix": "/llm-keys"
    }
  }
}
```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable the extension |
| `authToken` | string | - | Optional authentication token for API access |
| `routePrefix` | string | `/llm-keys` | URL prefix for all endpoints |

## API Endpoints

All endpoints return JSON responses in the format:
```json
{
  "success": true,
  "data": { ... }
}
```

or on error:
```json
{
  "success": false,
  "error": "Error message"
}
```

### Authentication

If `authToken` is configured, include it in requests via:
- Header: `Authorization: Bearer <token>`
- Header: `X-Auth-Token: <token>`

### List Profiles

```
GET /llm-keys/profiles
GET /llm-keys/profiles?provider=anthropic
```

Response:
```json
{
  "success": true,
  "data": {
    "profiles": [
      {
        "profileId": "anthropic:default",
        "provider": "anthropic",
        "type": "api_key",
        "email": "user@example.com",
        "keyPreview": "sk-a...xyz1"
      }
    ]
  }
}
```

### Get Single Profile

```
GET /llm-keys/profile?id=anthropic:default
```

### Set API Key

```
POST /llm-keys/api-key
Content-Type: application/json

{
  "profileId": "anthropic:default",
  "provider": "anthropic",
  "key": "sk-ant-api03-xxx",
  "email": "user@example.com"  // optional
}
```

### Set Token

```
POST /llm-keys/token
Content-Type: application/json

{
  "profileId": "github-copilot:default",
  "provider": "github-copilot",
  "token": "ghu_xxxx",
  "expires": 1706000000000,  // optional, ms since epoch
  "email": "user@example.com"  // optional
}
```

### Delete Profile

```
DELETE /llm-keys/profile
Content-Type: application/json

{
  "profileId": "anthropic:default"
}
```

### Set Profile Order

Set the priority order for profiles of a specific provider:

```
PUT /llm-keys/order
Content-Type: application/json

{
  "provider": "anthropic",
  "order": ["anthropic:work", "anthropic:personal", "anthropic:backup"]
}
```

## Example Usage with curl

```bash
# List all profiles
curl http://localhost:18789/llm-keys/profiles \
  -H "Authorization: Bearer your-secret-token"

# Add new API key
curl -X POST http://localhost:18789/llm-keys/api-key \
  -H "Authorization: Bearer your-secret-token" \
  -H "Content-Type: application/json" \
  -d '{"profileId": "openai:new", "provider": "openai", "key": "sk-proj-xxx"}'

# Delete a profile
curl -X DELETE http://localhost:18789/llm-keys/profile \
  -H "Authorization: Bearer your-secret-token" \
  -H "Content-Type: application/json" \
  -d '{"profileId": "openai:old"}'
```

## Security Notes

- Always configure `authToken` in production to prevent unauthorized access
- The API only returns masked key previews (first 4 and last 4 characters)
- Keys are stored in `~/.openclaw/auth-profiles.json`
- Changes take effect immediately for new requests
