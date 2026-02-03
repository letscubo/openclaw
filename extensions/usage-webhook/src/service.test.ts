import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Mock plugin-sdk before importing service
vi.mock("openclaw/plugin-sdk", () => ({
  onDiagnosticEvent: vi.fn(() => vi.fn()),
  emptyPluginConfigSchema: () => ({}),
}));

import { createUsageWebhookService } from "./service.js";

describe("createUsageWebhookService", () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear env vars
    delete process.env.USAGE_WEBHOOK_URL;
    delete process.env.OPENCLAW_USAGE_WEBHOOK_URL;
    delete process.env.USAGE_WEBHOOK_AUTH_HEADER;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should create a service with correct id", () => {
    const service = createUsageWebhookService();
    expect(service.id).toBe("usage-webhook");
  });

  it("should not start if no webhook URL is configured", async () => {
    const service = createUsageWebhookService();
    await service.start({
      config: {},
      stateDir: "/tmp",
      logger: mockLogger,
    });

    expect(mockLogger.info).toHaveBeenCalledWith(
      "usage-webhook: disabled (no webhook URL configured)",
    );
  });

  it("should start if USAGE_WEBHOOK_URL env var is set", async () => {
    process.env.USAGE_WEBHOOK_URL = "https://example.com/webhook";

    const service = createUsageWebhookService();
    await service.start({
      config: {},
      stateDir: "/tmp",
      logger: mockLogger,
    });

    expect(mockLogger.info).toHaveBeenCalledWith(
      "usage-webhook: enabled, sending to https://example.com/webhook",
    );
  });

  it("should start if config url is set", async () => {
    const service = createUsageWebhookService();
    await service.start({
      config: {
        usageWebhook: {
          url: "https://config.example.com/webhook",
        },
      },
      stateDir: "/tmp",
      logger: mockLogger,
    });

    expect(mockLogger.info).toHaveBeenCalledWith(
      "usage-webhook: enabled, sending to https://config.example.com/webhook",
    );
  });

  it("should prefer config url over env var", async () => {
    process.env.USAGE_WEBHOOK_URL = "https://env.example.com/webhook";

    const service = createUsageWebhookService();
    await service.start({
      config: {
        usageWebhook: {
          url: "https://config.example.com/webhook",
        },
      },
      stateDir: "/tmp",
      logger: mockLogger,
    });

    expect(mockLogger.info).toHaveBeenCalledWith(
      "usage-webhook: enabled, sending to https://config.example.com/webhook",
    );
  });

  it("should stop cleanly", async () => {
    const service = createUsageWebhookService();
    await service.start({
      config: {},
      stateDir: "/tmp",
      logger: mockLogger,
    });

    // Should not throw
    await service.stop?.({
      config: {},
      stateDir: "/tmp",
      logger: mockLogger,
    });
  });
});
