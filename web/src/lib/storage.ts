import { createReadStream } from "node:fs";
import { mkdir, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { HttpError } from "@/lib/http";

export const MAX_AUDIO_BYTES = 250 * 1024 * 1024;
export const MAX_ATTACHMENT_BYTES = 120 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

// Upload validation for audio lives in lib/audio.ts (accepts every format ffmpeg can read).
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".ogg", ".oga", ".opus", ".m4a", ".aac", ".flac", ".webm", ".aiff", ".aif"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"]);

const CONTENT_TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".opus": "audio/ogg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".webm": "audio/webm",
  ".aif": "audio/aiff",
  ".aiff": "audio/aiff",
  ".aifc": "audio/aiff",
  ".wave": "audio/wav",
  ".weba": "audio/webm",
  ".caf": "audio/x-caf",
  ".amr": "audio/amr",
  ".awb": "audio/amr-wb",
  ".3gp": "audio/3gpp",
  ".3gpp": "audio/3gpp",
  ".3ga": "audio/3gpp",
  ".3g2": "audio/3gpp2",
  ".m4b": "audio/mp4",
  ".m4r": "audio/mp4",
  ".wma": "audio/x-ms-wma",
  ".mka": "audio/x-matroska",
  ".ac3": "audio/ac3",
  ".spx": "audio/ogg",
  ".au": "audio/basic",
  ".mp2": "audio/mpeg",
  ".mpga": "audio/mpeg",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".cho": "text/plain; charset=utf-8",
  ".chordpro": "text/plain; charset=utf-8",
  ".musicxml": "application/vnd.recordare.musicxml+xml",
  ".xml": "application/xml",
  ".mxl": "application/vnd.recordare.musicxml",
  ".mid": "audio/midi",
  ".midi": "audio/midi",
  ".gp": "application/octet-stream",
  ".gpx": "application/octet-stream",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/** Types that browsers render inline safely. Everything else is forced to download. */
const INLINE_SAFE = new Set(["audio/", "image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "application/pdf", "text/plain"]);

export type UploadScope = "audio" | "songs" | "albums" | "avatars" | "ideas" | "bands";

export function getUploadRoot(): string {
  return path.resolve(process.env.UPLOAD_DIR ?? path.join(process.cwd(), "public", "uploads"));
}

export function contentTypeFor(filePath: string): string {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

export function isAudioFile(file: File): boolean {
  return file.type.startsWith("audio/") || AUDIO_EXTENSIONS.has(path.extname(file.name).toLowerCase());
}

export function isImageFile(file: File): boolean {
  const ext = path.extname(file.name).toLowerCase();
  // SVG is intentionally excluded: it can carry scripts.
  return (file.type.startsWith("image/") && file.type !== "image/svg+xml" && ext !== ".svg") || IMAGE_EXTENSIONS.has(ext);
}

function safeExtension(fileName: string, fallback: string): string {
  const ext = path.extname(fileName).toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(ext) ? ext : fallback;
}

/**
 * Persists an uploaded file below the upload root.
 * @returns the public URL (`/uploads/...`) that is served by the authenticated uploads route.
 */
export async function saveUpload(file: File, scope: UploadScope, entityId: string, options: {
  maxBytes: number;
  fallbackExtension?: string;
}): Promise<string> {
  if (file.size <= 0) {
    throw new HttpError("Die Datei ist leer.", 400);
  }
  if (file.size > options.maxBytes) {
    throw new HttpError(`Datei zu groß (max. ${Math.round(options.maxBytes / 1024 / 1024)} MB).`, 413);
  }

  const extension = safeExtension(file.name, options.fallbackExtension ?? "");
  const fileName = `${Date.now()}-${randomUUID()}${extension}`;
  const directory = path.join(getUploadRoot(), scope, entityId);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, fileName), Buffer.from(await file.arrayBuffer()));

  return `/uploads/${scope}/${entityId}/${fileName}`;
}

function resolveUploadPath(fileUrl: string): string | null {
  if (!fileUrl.startsWith("/uploads/")) {
    return null;
  }
  const root = getUploadRoot();
  const relative = path.posix.normalize(fileUrl.slice("/uploads/".length).split("?")[0] ?? "");
  if (relative.startsWith("..") || path.posix.isAbsolute(relative)) {
    return null;
  }
  const absolute = path.resolve(root, ...relative.split("/"));
  return absolute.startsWith(`${root}${path.sep}`) ? absolute : null;
}

/** Best-effort removal of a stored upload. */
export async function deleteUpload(fileUrl: string | null | undefined): Promise<void> {
  if (!fileUrl) {
    return;
  }
  const absolute = resolveUploadPath(fileUrl);
  if (!absolute) {
    return;
  }
  try {
    await unlink(absolute);
  } catch {
    // File may already be gone – nothing to do.
  }
}

export async function deleteUploadDirectory(scope: UploadScope, entityId: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(entityId)) {
    return;
  }
  try {
    await rm(path.join(getUploadRoot(), scope, entityId), { recursive: true, force: true });
  } catch {
    // ignore
  }
}

/** Streams a file with HTTP Range support (needed for seeking in audio players on iOS/Android). */
export async function streamFile(absolutePath: string, request: Request, extraHeaders: Record<string, string> = {}): Promise<Response> {
  const info = await stat(absolutePath);
  if (!info.isFile()) {
    throw new HttpError("Datei nicht gefunden.", 404);
  }

  const contentType = contentTypeFor(absolutePath);
  const inline = Array.from(INLINE_SAFE).some((prefix) => contentType.startsWith(prefix));
  const baseHeaders: Record<string, string> = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=86400",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    "Last-Modified": info.mtime.toUTCString(),
    ...(inline ? {} : { "Content-Disposition": `attachment; filename="${path.basename(absolutePath)}"` }),
    ...extraHeaders,
  };

  const range = request.headers.get("range");
  const size = info.size;

  if (range) {
    const match = range.match(/bytes=(\d*)-(\d*)/);
    let start = match?.[1] ? Number(match[1]) : NaN;
    let end = match?.[2] ? Number(match[2]) : NaN;

    if (Number.isNaN(start) && !Number.isNaN(end)) {
      // suffix range: last N bytes
      start = Math.max(0, size - end);
      end = size - 1;
    } else {
      if (Number.isNaN(start)) start = 0;
      if (Number.isNaN(end) || end >= size) end = size - 1;
    }

    if (start > end || start >= size) {
      return new Response(null, { status: 416, headers: { ...baseHeaders, "Content-Range": `bytes */${size}` } });
    }

    const stream = Readable.toWeb(createReadStream(absolutePath, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }

  const stream = Readable.toWeb(createReadStream(absolutePath)) as ReadableStream;
  return new Response(stream, {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": String(size) },
  });
}

export { resolveUploadPath };
