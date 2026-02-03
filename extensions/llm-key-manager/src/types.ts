/**
 * LLM Key Manager Extension Types
 */

export type ApiKeyCredential = {
  type: "api_key";
  provider: string;
  key: string;
  email?: string;
};

export type TokenCredential = {
  type: "token";
  provider: string;
  token: string;
  expires?: number;
  email?: string;
};

// Request types for HTTP API
export type SetKeyRequest = {
  profileId: string;
  provider: string;
  key: string;
  email?: string;
};

export type SetTokenRequest = {
  profileId: string;
  provider: string;
  token: string;
  expires?: number;
  email?: string;
};

export type DeleteKeyRequest = {
  profileId: string;
};

export type ListKeysRequest = {
  provider?: string;
};

// Response types
export type ApiResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type ProfileInfo = {
  profileId: string;
  provider: string;
  type: "api_key" | "token" | "oauth";
  email?: string;
  // masked key/token for security
  keyPreview?: string;
};

export type ListProfilesResponse = {
  profiles: ProfileInfo[];
};

// Config schema for the plugin
export type LlmKeyManagerConfig = {
  enabled?: boolean;
  // Optional authentication token for the API
  authToken?: string;
  // Route prefix (default: /llm-keys)
  routePrefix?: string;
};
