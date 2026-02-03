/**
 * LLM Key Manager Extension
 *
 * Provides HTTP API for real-time LLM key management.
 * This extension allows you to add, update, delete, and list
 * LLM API keys without restarting the gateway.
 *
 * Configuration (in openclaw.json):
 * {
 *   "extensions": {
 *     "llm-key-manager": {
 *       "enabled": true,
 *       "authToken": "your-secret-token",  // optional
 *       "routePrefix": "/llm-keys"          // optional, default: /llm-keys
 *     }
 *   }
 * }
 *
 * API Endpoints:
 * - GET  /llm-keys/profiles         - List all profiles
 * - GET  /llm-keys/profiles?provider=anthropic - List profiles for a provider
 * - GET  /llm-keys/profile?id=<id>  - Get single profile
 * - POST /llm-keys/api-key          - Set API key
 * - POST /llm-keys/token            - Set token
 * - DELETE /llm-keys/profile        - Delete profile
 * - PUT  /llm-keys/order            - Set profile order for a provider
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { createLlmKeyManagerRoutes } from "./src/service.js";
import type { LlmKeyManagerConfig } from "./src/types.js";

const plugin = {
  id: "llm-key-manager",
  name: "LLM Key Manager",
  description: "HTTP API for real-time LLM key management",

  register(api: OpenClawPluginApi) {
    const config = (api.pluginConfig ?? {}) as LlmKeyManagerConfig;

    // Check if explicitly disabled
    if (config.enabled === false) {
      api.logger.info("llm-key-manager: disabled by configuration");
      return;
    }

    // Register HTTP routes
    createLlmKeyManagerRoutes(api, config);

    const prefix = config.routePrefix ?? "/llm-keys";
    api.logger.info(`llm-key-manager: registered HTTP routes at ${prefix}/*`);
  },
};

export default plugin;
