// New API backend client for the Infinite Canvas integration.
//
// The canvas frontend authenticates against the New API user account system and
// will persist canvases to the New API backend (see /api/canvas/v1 added in the
// gallery fork). The base URL defaults to the same-origin "/api" path so the
// canvas can be served behind the same host as New API (e.g. via an Nginx
// reverse proxy). Override it at build time with VITE_NEWAPI_BASE_URL when the
// canvas is deployed on a different origin.
const NEWAPI_BASE = (import.meta.env.VITE_NEWAPI_BASE_URL || "/api").replace(/\/+$/, "");

export type NewApiSelfUser = {
    id: number;
    username: string;
    display_name: string;
    role: number;
    email?: string;
    [key: string]: unknown;
};

export type NewApiLoginData = {
    access_token: string;
    token_type?: string;
    access_expires_at?: number;
    user: NewApiSelfUser;
};

type NewApiEnvelope<T> = { success: boolean; message?: string; data?: T };

const TOKEN_STORAGE_KEY = "newapi_session_token";

export function getStoredToken(): string | null {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string | null): void {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
}

// Sends a request to the New API backend. When `token` is omitted the stored
// session token (if any) is attached automatically as a Bearer header. Pass
// `null` explicitly to suppress the auth header (used by the login call).
export async function apiRequest<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
    const headers = new Headers(options.headers);
    if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
    const authToken = token === undefined ? getStoredToken() : token;
    if (authToken) headers.set("authorization", `Bearer ${authToken}`);
    const response = await fetch(`${NEWAPI_BASE}${path}`, { ...options, headers });
    let envelope: NewApiEnvelope<T> | null = null;
    try {
        envelope = (await response.json()) as NewApiEnvelope<T>;
    } catch {
        envelope = null;
    }
    if (!response.ok || !envelope?.success) {
        const message = envelope?.message || `HTTP ${response.status}`;
        throw new Error(message);
    }
    return envelope.data as T;
}

export async function login(username: string, password: string): Promise<NewApiLoginData> {
    return apiRequest<NewApiLoginData>(
        "/user/login",
        {
            method: "POST",
            body: JSON.stringify({ username, password }),
        },
        null,
    );
}

export async function getSelf(): Promise<NewApiSelfUser> {
    return apiRequest<NewApiSelfUser>("/user/self");
}

// 画布工作台凭证：后端自动创建（或复用）本人的「Canvas Studio」令牌，
// 前端拿 base_url + token 直接调 /v1/*，用量计入用户自己的额度。
export type NewApiCanvasSession = { token: string; base_url: string };

export async function getCanvasSession(): Promise<NewApiCanvasSession> {
    return apiRequest<NewApiCanvasSession>("/canvas/v1/session");
}

export { NEWAPI_BASE };
