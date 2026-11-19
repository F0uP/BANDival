"use client";

import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";

/** Renders MusicXML (incl. compressed .mxl) with OpenSheetMusicDisplay. Loaded lazily. */
export function SheetMusic({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!url || !container) return;

    void (async () => {
      try {
        const [{ OpenSheetMusicDisplay }, response] = await Promise.all([import("opensheetmusicdisplay"), fetch(url, { credentials: "same-origin" })]);
        if (!response.ok) throw new Error(t("download failed"));
        const isCompressed = url.toLowerCase().endsWith(".mxl");
        // OSMD detects zipped MusicXML when it receives the raw bytes as a binary string.
        const content = isCompressed
          ? Array.from(new Uint8Array(await response.arrayBuffer()), (byte) => String.fromCharCode(byte)).join("")
          : await response.text();
        if (cancelled) return;
        container.innerHTML = "";
        const osmd = new OpenSheetMusicDisplay(container, { autoResize: true, drawingParameters: "compacttight", drawTitle: true });
        await osmd.load(content);
        if (!cancelled) {
          osmd.render();
          setError(null);
        }
      } catch {
        if (!cancelled) setError(t("Die Noten konnten nicht dargestellt werden. Ist die Datei gültiges MusicXML?"));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div ref={containerRef} className="sheet-music overflow-x-auto rounded-xl bg-white" />
    </div>
  );
}
