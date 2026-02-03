import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { createUsageWebhookService } from "./src/service.js";

const plugin = {
  id: "usage-webhook",
  name: "Usage Webhook",
  description: "Send LLM model usage data to external webhook endpoint",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    api.registerService(createUsageWebhookService());
  },
};

export default plugin;
