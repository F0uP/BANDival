import { HttpError } from "@/lib/http";

/**
 * Optional AI integration – configured by the server admin via environment variables:
 *   AI_PROVIDER=openai|gemini|ollama   AI_MODEL=…   AI_API_KEY=…   AI_BASE_URL=… (OpenAI-compatible or Ollama URL)
 *   AI_TRANSCRIBE_MODEL=whisper-1      (OpenAI) – Gemini transcribes with AI_MODEL, Ollama cannot transcribe audio
 *   STEM_SEPARATION_URL=http://stem-splitter:8000   STEM_SEPARATION_TOKEN=…   (self-hosted Demucs service)
 * Nothing is sent anywhere unless these variables are set.
 */

export type AiProvider = "openai" | "gemini" | "ollama";

type AiConfig = { provider: AiProvider; model: string; apiKey: string | null; baseUrl: string; transcribeModel: string | null };

const DEFAULT_MODEL: Record<AiProvider, string> = { openai: "gpt-4o-mini", gemini: "gemini-2.0-flash", ollama: "llama3.1" };
const DEFAULT_BASE: Record<AiProvider, string> = {
  openai: "https://api.openai.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
  ollama: "http://ollama:11434",
};

export function aiConfig(): AiConfig | null {
  const provider = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (provider !== "openai" && provider !== "gemini" && provider !== "ollama") return null;
  const apiKey = process.env.AI_API_KEY?.trim() || null;
  if (provider !== "ollama" && !apiKey) return null;
  return {
    provider,
    model: process.env.AI_MODEL?.trim() || DEFAULT_MODEL[provider],
    apiKey,
    baseUrl: (process.env.AI_BASE_URL?.trim() || DEFAULT_BASE[provider]).replace(/\/+$/, ""),
    transcribeModel: provider === "openai" ? process.env.AI_TRANSCRIBE_MODEL?.trim() || "whisper-1" : provider === "gemini" ? process.env.AI_MODEL?.trim() || DEFAULT_MODEL.gemini : null,
  };
}

export function stemSeparationConfig(): { url: string; token: string | null } | null {
  const url = process.env.STEM_SEPARATION_URL?.trim().replace(/\/+$/, "");
  return url ? { url, token: process.env.STEM_SEPARATION_TOKEN?.trim() || null } : null;
}

export function aiStatus() {
  const config = aiConfig();
  return {
    enabled: Boolean(config),
    provider: config?.provider ?? null,
    model: config?.model ?? null,
    transcription: Boolean(config?.transcribeModel),
    stemSeparation: Boolean(stemSeparationConfig()),
    /** Ollama (and a custom base URL) usually stays inside your own infrastructure. */
    external: config ? config.provider !== "ollama" && !process.env.AI_BASE_URL : false,
  };
}

export function requireAi(): AiConfig {
  const config = aiConfig();
  if (!config) throw new HttpError("KI-Funktionen sind auf diesem Server nicht eingerichtet (AI_PROVIDER).", 501);
  return config;
}

async function postJson(url: string, body: unknown, headers: Record<string, string>, timeoutMs = 120_000): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new HttpError(`KI-Dienst nicht erreichbar: ${(error as Error).message}`, 502);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (data as { error?: { message?: string } | string } | null)?.error;
    throw new HttpError(`KI-Dienst meldet Fehler ${response.status}${typeof message === "string" ? `: ${message}` : message?.message ? `: ${message.message}` : ""}`, 502);
  }
  return data;
}

export type CompleteOptions = { system: string; prompt: string; json?: boolean; temperature?: number };

/** Single-turn completion on the configured provider. */
export async function aiComplete(options: CompleteOptions): Promise<string> {
  const config = requireAi();
  const temperature = options.temperature ?? 0.4;

  if (config.provider === "openai") {
    const data = await postJson(`${config.baseUrl}/chat/completions`, {
      model: config.model,
      temperature,
      messages: [{ role: "system", content: options.system }, { role: "user", content: options.prompt }],
      ...(options.json ? { response_format: { type: "json_object" } } : {}),
    }, { Authorization: `Bearer ${config.apiKey}` }) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content?.trim() ?? "";
  }

  if (config.provider === "gemini") {
    const data = await postJson(`${config.baseUrl}/models/${encodeURIComponent(config.model)}:generateContent`, {
      systemInstruction: { parts: [{ text: options.system }] },
      contents: [{ role: "user", parts: [{ text: options.prompt }] }],
      generationConfig: { temperature, ...(options.json ? { responseMimeType: "application/json" } : {}) },
    }, { "x-goog-api-key": config.apiKey! }) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    return data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";
  }

  const data = await postJson(`${config.baseUrl}/api/chat`, {
    model: config.model,
    stream: false,
    options: { temperature },
    ...(options.json ? { format: "json" } : {}),
    messages: [{ role: "system", content: options.system }, { role: "user", content: options.prompt }],
  }, config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}, 300_000) as { message?: { content?: string } };
  return data.message?.content?.trim() ?? "";
}

/** Parses JSON from a model answer (tolerates ```json fences). */
export function parseAiJson<T>(text: string): T {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const match = /\{[\s\S]*\}/.exec(cleaned);
    if (match) return JSON.parse(match[0]) as T;
    throw new HttpError("Die KI-Antwort war kein gültiges JSON.", 502);
  }
}

/** Speech-to-text for voice memos (OpenAI Whisper or Gemini audio understanding). */
export async function aiTranscribe(file: Buffer, fileName: string, mimeType: string): Promise<string> {
  const config = requireAi();
  if (!config.transcribeModel) throw new HttpError("Der eingestellte KI-Anbieter kann kein Audio transkribieren (Ollama). Nutze OpenAI oder Gemini.", 501);

  if (config.provider === "openai") {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(file)], { type: mimeType }), fileName);
    form.append("model", config.transcribeModel);
    form.append("language", "de");
    let response: Response;
    try {
      response = await fetch(`${config.baseUrl}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}` },
        body: form,
        signal: AbortSignal.timeout(180_000),
      });
    } catch (error) {
      throw new HttpError(`KI-Dienst nicht erreichbar: ${(error as Error).message}`, 502);
    }
    const data = await response.json().catch(() => null) as { text?: string; error?: { message?: string } } | null;
    if (!response.ok) throw new HttpError(`Transkription fehlgeschlagen: ${data?.error?.message ?? response.status}`, 502);
    return data?.text?.trim() ?? "";
  }

  if (file.length > 18 * 1024 * 1024) throw new HttpError("Die Aufnahme ist für die Transkription zu groß (max. ~18 MB).", 413);
  const data = await postJson(`${config.baseUrl}/models/${encodeURIComponent(config.transcribeModel)}:generateContent`, {
    contents: [{
      role: "user",
      parts: [
        { text: "Transkribiere diese Sprachnotiz wörtlich auf Deutsch (bzw. in der gesprochenen Sprache). Gib nur den Text zurück. Wenn nur Musik zu hören ist, beschreibe sie in einem Satz (Tempo, Stimmung, Instrumente)." },
        { inline_data: { mime_type: mimeType, data: file.toString("base64") } },
      ],
    }],
  }, { "x-goog-api-key": config.apiKey! }, 180_000) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";
}
