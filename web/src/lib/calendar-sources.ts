export const sourceSelect = {
  id: true,
  label: true,
  kind: true,
  enabled: true,
  lastSyncedAt: true,
  lastError: true,
  createdAt: true,
  url: true,
  _count: { select: { blocks: true } },
} as const;

/** Never send the full secret iCal URL back to the client – only a recognizable hint. */
export function presentSource<T extends { url: string | null }>(source: T) {
  let urlHint: string | null = null;
  if (source.url) {
    try {
      urlHint = new URL(source.url.replace(/^webcal:/i, "https:")).hostname;
    } catch {
      urlHint = null;
    }
  }
  const { url: _url, ...rest } = source;
  void _url;
  return { ...rest, urlHint };
}
