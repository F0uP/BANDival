"use client";

export class ApiError extends Error {
  status: number;
  /** Parsed JSON body of the error response (e.g. the merge conflict of a 409). */
  data: unknown;

  constructor(message: string, status: number, data: unknown = null) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

const CSRF_COOKIE = "bandival_csrf";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const match = document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

let csrfPromise: Promise<string> | null = null;

/** Returns the CSRF token, fetching a fresh cookie if necessary. */
export async function getCsrfToken(force = false): Promise<string> {
  const existing = readCookie(CSRF_COOKIE);
  if (existing && !force) {
    return existing;
  }
  csrfPromise ??= fetch("/api/auth/csrf", { credentials: "same-origin", cache: "no-store" })
    .then(async (response) => {
      const data = (await response.json().catch(() => ({}))) as { csrfToken?: string };
      return readCookie(CSRF_COOKIE) ?? data.csrfToken ?? "";
    })
    .finally(() => {
      csrfPromise = null;
    });
  return csrfPromise;
}

type RequestOptions = Omit<RequestInit, "body"> & { body?: unknown };

async function request<T>(url: string, options: RequestOptions = {}, retried = false): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const headers = new Headers(options.headers);
  let body: BodyInit | undefined;

  if (options.body instanceof FormData) {
    body = options.body;
  } else if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.body);
  }

  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    headers.set("x-csrf-token", await getCsrfToken());
  }

  let response: Response;
  try {
    response = await fetch(url, { ...options, method, headers, body, credentials: "same-origin" });
  } catch {
    throw new ApiError("Keine Verbindung zum Server. Bist du offline?", 0);
  }

  // A stale CSRF cookie (e.g. after logout in another tab) – refresh once and retry.
  if (response.status === 403 && !retried && method !== "GET") {
    const clone = response.clone();
    const data = (await clone.json().catch(() => null)) as { error?: string } | null;
    if (data?.error?.includes("CSRF")) {
      await getCsrfToken(true);
      return request<T>(url, options, true);
    }
  }

  const contentType = response.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json") ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const message = (data as { error?: string } | null)?.error ?? `Anfrage fehlgeschlagen (${response.status}).`;
    if (response.status === 401 && typeof window !== "undefined" && window.location.pathname.startsWith("/app")) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- outside React (no router available here)
      window.location.href = `/login?next=${next}`;
    }
    throw new ApiError(message, response.status, data);
  }

  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, body?: unknown) => request<T>(url, { method: "POST", body }),
  put: <T>(url: string, body?: unknown) => request<T>(url, { method: "PUT", body }),
  patch: <T>(url: string, body?: unknown) => request<T>(url, { method: "PATCH", body }),
  delete: <T>(url: string, body?: unknown) => request<T>(url, { method: "DELETE", body }),
};

export const fetcher = <T>(url: string) => api.get<T>(url);

export function errorMessage(error: unknown, fallback = "Etwas ist schiefgelaufen."): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Upload with progress reporting (fetch has no upload progress). */
export function uploadWithProgress<T>(
  url: string,
  formData: FormData,
  onProgress: (percent: number) => void,
): { promise: Promise<T>; cancel: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<T>((resolve, reject) => {
    void getCsrfToken().then((token) => {
      xhr.open("POST", url);
      xhr.withCredentials = true;
      xhr.setRequestHeader("x-csrf-token", token);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
        }
      };
      xhr.onerror = () => reject(new ApiError("Netzwerkfehler beim Upload.", 0));
      xhr.onabort = () => reject(new ApiError("Upload abgebrochen.", 0));
      xhr.onload = () => {
        let data: unknown = null;
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          data = null;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress(100);
          resolve(data as T);
        } else {
          const message = (data as { error?: string } | null)?.error
            ?? (xhr.status === 413 ? "Datei ist zu groß." : `Upload fehlgeschlagen (${xhr.status}).`);
          reject(new ApiError(message, xhr.status));
        }
      };
      xhr.send(formData);
    });
  });
  return { promise, cancel: () => xhr.abort() };
}
