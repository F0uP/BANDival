"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Bluetooth, FlaskConical, Smartphone, Vibrate, X } from "lucide-react";
import { cn } from "@/lib/client/cn";
import { bluetoothSupported, phoneVibrationSupported, pulseHub, type PulseDevice } from "@/lib/client/pulse";
import { sharedMetronome } from "@/lib/client/live-metronome";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/display";
import { useToast } from "@/components/ui/feedback";

export function usePulse() {
  return useSyncExternalStore(pulseHub.subscribe, pulseHub.getSnapshot, pulseHub.getSnapshot);
}

const KIND_ICON = { ble: Bluetooth, phone: Smartphone, simulator: FlaskConical } as const;

function DeviceRow({ device }: { device: PulseDevice }) {
  const Icon = KIND_ICON[device.kind];
  const [flash, setFlash] = useState<"accent" | "beat" | null>(null);

  useEffect(() => {
    if (device.kind !== "simulator") return;
    // The simulator visualises every pulse the wearable would play.
    return sharedMetronome().subscribe((beat) => {
      setFlash(beat.accent ? "accent" : "beat");
      window.setTimeout(() => setFlash(null), 90);
    });
  }, [device.kind]);

  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <span className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors duration-75",
        flash === "accent" ? "bg-accent text-accent-fg" : flash === "beat" ? "bg-accent-soft text-accent-text" : "bg-surface-2 text-muted",
      )}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{device.label}</p>
        <p className="text-xs text-muted">
          {device.status === "connected" ? "Verbunden" : device.status === "connecting" ? "Verbinde …" : device.status === "error" ? device.error ?? "Fehler" : "Getrennt"}
          {device.battery !== undefined ? ` · Akku ${device.battery} %` : ""}
          {device.latencyMs !== undefined ? ` · ${device.latencyMs} ms` : ""}
          {device.firmware ? ` · FW ${device.firmware}` : ""}
        </p>
      </div>
      <button type="button" onClick={() => pulseHub.remove(device.id)} className="rounded-lg p-1.5 text-subtle hover:bg-surface-2 hover:text-fg" aria-label="Entfernen">
        <X className="size-4" />
      </button>
    </li>
  );
}

/** Haptic metronome outputs: Bandival Pulse wearable (in development), phone vibration and a simulator. */
export function PulsePanel({ compact = false }: { compact?: boolean }) {
  const { devices, settings, log } = usePulse();
  const [connecting, setConnecting] = useState(false);
  const toast = useToast();
  const hasSimulator = devices.some((device) => device.kind === "simulator");

  const connect = async () => {
    setConnecting(true);
    try {
      await pulseHub.connectBluetooth();
      toast.success("Bandival Pulse verbunden.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="space-y-3">
      {!compact ? (
        <div className="flex items-start gap-3 rounded-xl border border-accent/30 bg-accent-soft p-3 text-sm">
          <Vibrate className="mt-0.5 size-4 shrink-0 text-accent-text" />
          <p>
            <strong>Bandival Pulse</strong> <Badge tone="accent" className="ml-1">In Entwicklung</Badge><br />
            Ein Metronom zum Fühlen statt Hören: ein kleines Gerät am Handgelenk, Gürtel oder Drum-Hocker vibriert im Takt – gesteuert aus dem Live-Modus,
            inklusive Tempowechsel pro Song. Bis es das Gerät gibt, kannst du mit der Handy-Vibration oder dem Simulator testen.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={<Bluetooth />} loading={connecting} disabled={!bluetoothSupported()} onClick={() => void connect()} title={bluetoothSupported() ? undefined : "Web Bluetooth: Chrome/Edge auf Android, Windows oder macOS"}>
          Pulse verbinden
        </Button>
        <Button size="sm" icon={<Smartphone />} disabled={!phoneVibrationSupported() || devices.some((device) => device.kind === "phone")} onClick={() => pulseHub.enablePhone()} title={phoneVibrationSupported() ? undefined : "Nur auf Android-Geräten"}>
          Handy-Vibration
        </Button>
        <Button size="sm" variant="ghost" icon={<FlaskConical />} disabled={hasSimulator} onClick={() => pulseHub.enableSimulator()}>Simulator</Button>
        {devices.length ? <Button size="sm" variant="ghost" onClick={() => pulseHub.test()}>Test-Puls</Button> : null}
      </div>

      {devices.length > 0 ? (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {devices.map((device) => <DeviceRow key={device.id} device={device} />)}
        </ul>
      ) : null}

      {devices.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs">
            <span className="flex justify-between"><span className="font-medium">Stärke</span><span className="text-muted">{Math.round((settings.intensity / 255) * 100)} %</span></span>
            <input type="range" min={40} max={255} value={settings.intensity} onChange={(event) => pulseHub.updateSettings({ intensity: Number(event.target.value) })} className="w-full accent-[var(--accent)]" />
          </label>
          <label className="text-xs">
            <span className="flex justify-between"><span className="font-medium">Akzent (Eins)</span><span className="text-muted">{Math.round((settings.accentIntensity / 255) * 100)} %</span></span>
            <input type="range" min={40} max={255} value={settings.accentIntensity} onChange={(event) => pulseHub.updateSettings({ accentIntensity: Number(event.target.value) })} className="w-full accent-[var(--accent)]" />
          </label>
          <label className="text-xs">
            <span className="flex justify-between"><span className="font-medium">Pulslänge</span><span className="text-muted">{settings.pulseMs} ms</span></span>
            <input type="range" min={15} max={120} value={settings.pulseMs} onChange={(event) => pulseHub.updateSettings({ pulseMs: Number(event.target.value) })} className="w-full accent-[var(--accent)]" />
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={settings.subdivisions} onChange={(event) => pulseHub.updateSettings({ subdivisions: event.target.checked })} />
            Unterteilungen fühlen (Achtel / Triolen)
          </label>
          <label className="flex items-center gap-2 text-xs sm:col-span-2">
            <input type="checkbox" checked={settings.streamMode} onChange={(event) => pulseHub.updateSettings({ streamMode: event.target.checked })} />
            Stream-Modus (jeder Schlag einzeln senden – für einfache Firmware ohne eigene Uhr)
          </label>
        </div>
      ) : null}

      {hasSimulator && log.length > 0 ? (
        <pre className="max-h-40 overflow-y-auto rounded-xl bg-surface-2 p-2.5 font-mono text-[11px] leading-relaxed text-muted">{log.join("\n")}</pre>
      ) : null}
    </div>
  );
}
