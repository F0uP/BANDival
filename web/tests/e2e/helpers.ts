import { expect, request, type APIRequestContext, type APIResponse } from "@playwright/test";

/** Small API client that handles the CSRF double-submit cookie like the real frontend does. */
export class ApiClient {
  constructor(readonly ctx: APIRequestContext) {}

  static async create(baseURL: string): Promise<ApiClient> {
    const ctx = await request.newContext({ baseURL });
    await ctx.get("/api/auth/csrf");
    return new ApiClient(ctx);
  }

  private async csrf(): Promise<string> {
    const state = await this.ctx.storageState();
    return state.cookies.find((cookie) => cookie.name === "bandival_csrf")?.value ?? "";
  }

  get(url: string): Promise<APIResponse> {
    return this.ctx.get(url);
  }

  async post(url: string, data?: unknown): Promise<APIResponse> {
    return this.ctx.post(url, { data, headers: { "x-csrf-token": await this.csrf() } });
  }

  async put(url: string, data?: unknown): Promise<APIResponse> {
    return this.ctx.put(url, { data, headers: { "x-csrf-token": await this.csrf() } });
  }

  async patch(url: string, data?: unknown): Promise<APIResponse> {
    return this.ctx.patch(url, { data, headers: { "x-csrf-token": await this.csrf() } });
  }

  async delete(url: string, data?: unknown): Promise<APIResponse> {
    return this.ctx.delete(url, { data, headers: { "x-csrf-token": await this.csrf() } });
  }

  async upload(url: string, fields: Record<string, string | { name: string; mimeType: string; buffer: Buffer }>): Promise<APIResponse> {
    return this.ctx.post(url, { multipart: fields, headers: { "x-csrf-token": await this.csrf() } });
  }

  async json<T>(response: APIResponse | Promise<APIResponse>, status?: number): Promise<T> {
    const res = await response;
    const body = await res.json().catch(() => ({}));
    if (status !== undefined) {
      expect(res.status(), JSON.stringify(body)).toBe(status);
    } else {
      expect(res.ok(), JSON.stringify(body)).toBeTruthy();
    }
    return body as T;
  }
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@bandival.test`;
}

export const PASSWORD = "e2e-password-123";

/** Registers a fresh user (with their own band) and returns the logged-in client + band id. */
export async function registerUser(baseURL: string, options: { name?: string; bandName?: string; inviteToken?: string; email?: string } = {}) {
  const api = await ApiClient.create(baseURL);
  const email = options.email ?? uniqueEmail("user");
  await api.json(api.post("/api/auth/register", {
    email,
    password: PASSWORD,
    displayName: options.name ?? "E2E User",
    bandName: options.bandName ?? null,
    inviteToken: options.inviteToken ?? null,
  }), 201);
  const me = await api.json<{ user: { userId: string; defaultBandId: string; bands: Array<{ id: string; name: string; role: string }> } }>(api.get("/api/auth/me"));
  return { api, email, userId: me.user.userId, bandId: me.user.defaultBandId, bands: me.user.bands };
}

export function dateKeyInDays(days: number): string {
  const date = new Date(Date.now() + days * 86_400_000);
  return date.toISOString().slice(0, 10);
}
