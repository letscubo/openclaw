/**
 * LLM Key Manager HTTP Service
 *
 * Provides HTTP API endpoints for real-time LLM key management.
 * Directly reads/writes ~/.openclaw/auth-profiles.json to stay
 * independent from core modules.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type {
  ApiResponse,
  DeleteKeyRequest,
  LlmKeyManagerConfig,
  ListProfilesResponse,
  ProfileInfo,
  SetKeyRequest,
  SetTokenRequest,
} from "./types.js";

// Auth profiles file path
const AUTH_PROFILES_PATH = path.join(os.homedir(), ".openclaw", "auth-profiles.json");

// Type definitions for auth-profiles.json structure
type ApiKeyCredential = {
  type: "api_key";
  provider: string;
  key: string;
  email?: string;
};

type TokenCredential = {
  type: "token";
  provider: string;
  token: string;
  expires?: number;
  email?: string;
};

type OAuthCredential = {
  type: "oauth";
  provider: string;
  access?: string;
  refresh?: string;
  expires?: number;
  email?: string;
};

type AuthProfileCredential = ApiKeyCredential | TokenCredential | OAuthCredential;

type ProfileUsageStats = {
  lastUsed?: number;
  cooldownUntil?: number;
  disabledUntil?: number;
  disabledReason?: string;
  errorCount?: number;
  failureCounts?: Record<string, number>;
  lastFailureAt?: number;
};

type AuthProfileStore = {
  version: number;
  profiles: Record<string, AuthProfileCredential>;
  order?: Record<string, string[]>;
  lastGood?: Record<string, string>;
  usageStats?: Record<string, ProfileUsageStats>;
};

// Helper to load auth profiles
function loadAuthProfiles(): AuthProfileStore {
  try {
    if (!fs.existsSync(AUTH_PROFILES_PATH)) {
      return { version: 1, profiles: {} };
    }
    const content = fs.readFileSync(AUTH_PROFILES_PATH, "utf-8");
    const data = JSON.parse(content) as AuthProfileStore;
    return {
      version: data.version ?? 1,
      profiles: data.profiles ?? {},
      order: data.order,
      lastGood: data.lastGood,
      usageStats: data.usageStats,
    };
  } catch {
    return { version: 1, profiles: {} };
  }
}

// Helper to save auth profiles
function saveAuthProfiles(store: AuthProfileStore): void {
  const dir = path.dirname(AUTH_PROFILES_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const payload = {
    version: store.version,
    profiles: store.profiles,
    ...(store.order ? { order: store.order } : {}),
    ...(store.lastGood ? { lastGood: store.lastGood } : {}),
    ...(store.usageStats ? { usageStats: store.usageStats } : {}),
  };
  fs.writeFileSync(AUTH_PROFILES_PATH, JSON.stringify(payload, null, 2));
}

// Helper to parse JSON body
async function parseJsonBody<T>(req: IncomingMessage): Promise<T | null> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body) as T);
      } catch {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}

// Helper to send JSON response
function sendJson<T>(res: ServerResponse, status: number, data: ApiResponse<T>): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

// Mask key/token for security (show first 4 and last 4 chars)
function maskSecret(secret: string): string {
  if (secret.length <= 8) {
    return "****";
  }
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}

export function createLlmKeyManagerRoutes(api: OpenClawPluginApi, config: LlmKeyManagerConfig) {
  const prefix = config.routePrefix ?? "/llm-keys";
  const authToken = config.authToken;

  // Auth middleware
  function checkAuth(req: IncomingMessage, res: ServerResponse): boolean {
    if (!authToken) {
      return true; // No auth configured
    }
    const authHeader = req.headers.authorization;
    const providedToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : req.headers["x-auth-token"];

    if (providedToken !== authToken) {
      sendJson(res, 401, { success: false, error: "Unauthorized" });
      return false;
    }
    return true;
  }

  // GET /llm-keys/profiles - List all profiles
  api.registerHttpRoute({
    path: `${prefix}/profiles`,
    handler: async (req, res) => {
      if (req.method !== "GET") {
        sendJson(res, 405, { success: false, error: "Method not allowed" });
        return;
      }
      if (!checkAuth(req, res)) return;

      try {
        const store = loadAuthProfiles();

        const profiles: ProfileInfo[] = Object.entries(store.profiles).map(([profileId, cred]) => {
          const info: ProfileInfo = {
            profileId,
            provider: cred.provider,
            type: cred.type,
            email: cred.email,
          };

          if (cred.type === "api_key") {
            info.keyPreview = maskSecret(cred.key);
          } else if (cred.type === "token") {
            info.keyPreview = maskSecret(cred.token);
          }

          return info;
        });

        // Filter by provider if specified
        const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
        const providerFilter = url.searchParams.get("provider");
        const filtered = providerFilter
          ? profiles.filter((p) => p.provider === providerFilter)
          : profiles;

        sendJson<ListProfilesResponse>(res, 200, {
          success: true,
          data: { profiles: filtered },
        });
      } catch (err) {
        api.logger.error("Failed to list profiles", err);
        sendJson(res, 500, {
          success: false,
          error: err instanceof Error ? err.message : "Internal error",
        });
      }
    },
  });

  // POST /llm-keys/api-key - Set API key
  api.registerHttpRoute({
    path: `${prefix}/api-key`,
    handler: async (req, res) => {
      if (req.method !== "POST") {
        sendJson(res, 405, { success: false, error: "Method not allowed" });
        return;
      }
      if (!checkAuth(req, res)) return;

      const body = await parseJsonBody<SetKeyRequest>(req);
      if (!body || !body.profileId || !body.provider || !body.key) {
        sendJson(res, 400, {
          success: false,
          error: "Missing required fields: profileId, provider, key",
        });
        return;
      }

      try {
        const store = loadAuthProfiles();

        store.profiles[body.profileId] = {
          type: "api_key",
          provider: body.provider,
          key: body.key,
          ...(body.email ? { email: body.email } : {}),
        };

        saveAuthProfiles(store);

        api.logger.info(`API key set for profile: ${body.profileId}`);
        sendJson(res, 200, {
          success: true,
          data: { profileId: body.profileId, provider: body.provider },
        });
      } catch (err) {
        api.logger.error("Failed to set API key", err);
        sendJson(res, 500, {
          success: false,
          error: err instanceof Error ? err.message : "Internal error",
        });
      }
    },
  });

  // POST /llm-keys/token - Set token
  api.registerHttpRoute({
    path: `${prefix}/token`,
    handler: async (req, res) => {
      if (req.method !== "POST") {
        sendJson(res, 405, { success: false, error: "Method not allowed" });
        return;
      }
      if (!checkAuth(req, res)) return;

      const body = await parseJsonBody<SetTokenRequest>(req);
      if (!body || !body.profileId || !body.provider || !body.token) {
        sendJson(res, 400, {
          success: false,
          error: "Missing required fields: profileId, provider, token",
        });
        return;
      }

      try {
        const store = loadAuthProfiles();

        store.profiles[body.profileId] = {
          type: "token",
          provider: body.provider,
          token: body.token,
          ...(body.expires ? { expires: body.expires } : {}),
          ...(body.email ? { email: body.email } : {}),
        };

        saveAuthProfiles(store);

        api.logger.info(`Token set for profile: ${body.profileId}`);
        sendJson(res, 200, {
          success: true,
          data: { profileId: body.profileId, provider: body.provider },
        });
      } catch (err) {
        api.logger.error("Failed to set token", err);
        sendJson(res, 500, {
          success: false,
          error: err instanceof Error ? err.message : "Internal error",
        });
      }
    },
  });

  // DELETE /llm-keys/profile - Delete profile
  api.registerHttpRoute({
    path: `${prefix}/profile`,
    handler: async (req, res) => {
      if (req.method !== "DELETE") {
        // Let GET handler take care of GET requests
        return;
      }
      if (!checkAuth(req, res)) return;

      const body = await parseJsonBody<DeleteKeyRequest>(req);
      if (!body || !body.profileId) {
        sendJson(res, 400, {
          success: false,
          error: "Missing required field: profileId",
        });
        return;
      }

      try {
        const store = loadAuthProfiles();

        if (!store.profiles[body.profileId]) {
          sendJson(res, 404, {
            success: false,
            error: `Profile not found: ${body.profileId}`,
          });
          return;
        }

        delete store.profiles[body.profileId];

        // Clean up order references
        if (store.order) {
          for (const provider of Object.keys(store.order)) {
            store.order[provider] = store.order[provider].filter((id) => id !== body.profileId);
            if (store.order[provider].length === 0) {
              delete store.order[provider];
            }
          }
          if (Object.keys(store.order).length === 0) {
            store.order = undefined;
          }
        }

        // Clean up lastGood references
        if (store.lastGood) {
          for (const provider of Object.keys(store.lastGood)) {
            if (store.lastGood[provider] === body.profileId) {
              delete store.lastGood[provider];
            }
          }
          if (Object.keys(store.lastGood).length === 0) {
            store.lastGood = undefined;
          }
        }

        // Clean up usageStats
        if (store.usageStats) {
          delete store.usageStats[body.profileId];
          if (Object.keys(store.usageStats).length === 0) {
            store.usageStats = undefined;
          }
        }

        saveAuthProfiles(store);

        api.logger.info(`Profile deleted: ${body.profileId}`);
        sendJson(res, 200, {
          success: true,
          data: { profileId: body.profileId },
        });
      } catch (err) {
        api.logger.error("Failed to delete profile", err);
        sendJson(res, 500, {
          success: false,
          error: err instanceof Error ? err.message : "Internal error",
        });
      }
    },
  });

  // GET /llm-keys/profile?id=xxx - Get single profile
  api.registerHttpRoute({
    path: `${prefix}/profile`,
    handler: async (req, res) => {
      if (req.method !== "GET") {
        // Let DELETE handler take care of DELETE requests
        return;
      }
      if (!checkAuth(req, res)) return;

      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
      const profileId = url.searchParams.get("id");

      if (!profileId) {
        sendJson(res, 400, {
          success: false,
          error: "Missing query parameter: id",
        });
        return;
      }

      try {
        const store = loadAuthProfiles();
        const cred = store.profiles[profileId];

        if (!cred) {
          sendJson(res, 404, {
            success: false,
            error: `Profile not found: ${profileId}`,
          });
          return;
        }

        const info: ProfileInfo = {
          profileId,
          provider: cred.provider,
          type: cred.type,
          email: cred.email,
        };

        if (cred.type === "api_key") {
          info.keyPreview = maskSecret(cred.key);
        } else if (cred.type === "token") {
          info.keyPreview = maskSecret(cred.token);
        }

        sendJson<ProfileInfo>(res, 200, {
          success: true,
          data: info,
        });
      } catch (err) {
        api.logger.error("Failed to get profile", err);
        sendJson(res, 500, {
          success: false,
          error: err instanceof Error ? err.message : "Internal error",
        });
      }
    },
  });

  // PUT /llm-keys/order - Set profile order for a provider
  api.registerHttpRoute({
    path: `${prefix}/order`,
    handler: async (req, res) => {
      if (req.method !== "PUT") {
        sendJson(res, 405, { success: false, error: "Method not allowed" });
        return;
      }
      if (!checkAuth(req, res)) return;

      const body = await parseJsonBody<{ provider: string; order: string[] }>(req);
      if (!body || !body.provider || !Array.isArray(body.order)) {
        sendJson(res, 400, {
          success: false,
          error: "Missing required fields: provider, order (array)",
        });
        return;
      }

      try {
        const store = loadAuthProfiles();

        // Deduplicate and sanitize the order list
        const sanitized = body.order
          .map((entry) => String(entry).trim())
          .filter(Boolean);
        const deduped: string[] = [];
        for (const entry of sanitized) {
          if (!deduped.includes(entry)) {
            deduped.push(entry);
          }
        }

        store.order = store.order ?? {};

        if (deduped.length === 0) {
          delete store.order[body.provider];
          if (Object.keys(store.order).length === 0) {
            store.order = undefined;
          }
        } else {
          store.order[body.provider] = deduped;
        }

        saveAuthProfiles(store);

        api.logger.info(`Profile order set for provider: ${body.provider}`);
        sendJson(res, 200, {
          success: true,
          data: { provider: body.provider, order: deduped },
        });
      } catch (err) {
        api.logger.error("Failed to set profile order", err);
        sendJson(res, 500, {
          success: false,
          error: err instanceof Error ? err.message : "Internal error",
        });
      }
    },
  });
}
