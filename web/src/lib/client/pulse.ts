"use client";

import {
  PULSE_CONTROL_UUID, PULSE_DEVICE_NAME_PREFIX, PULSE_SERVICE_UUID, PULSE_STATUS_UUID,
  accentMaskFor, decodeCommand, decodeStatus, encodeBeat, encodeHello, encodeIntensity, encodePing, encodeSong, encodeStart, encodeStop, encodeTempo,
  type DecodedCommand, type StartParams,
} from "@/lib/pulse/protocol";
import type { BeatInfo, MetronomeConfig } from "@/lib/client/live-metronome";
import { t } from "@/lib/i18n";
import { intlLocale } from "@/lib/i18n";

/**
 * Bandival Pulse – haptic metronome outputs.
 *  - "ble":       the upcoming Bandival Pulse wearable via Web Bluetooth (protocol v1, see docs/bandival-pulse.md)
 *  - "phone":     vibration motor of this phone (Android Chrome / Bandival Android app)
 *  - "simulator": shows the protocol traffic on screen – for testing & firmware development
 */

export type PulseKind = "ble" | "phone" | "simulator";
export type PulseSettings = { intensity: number; accentIntensity: number; pulseMs: number; subdivisions: boolean; streamMode: boolean };
export type PulseDevice = {
  id: string;
  kind: PulseKind;
  label: string;
  status: "connected" | "connecting" | "disconnected" | "error";
  battery?: number;
  firmware?: string;
  latencyMs?: number;
  error?: string;
};

type Listener = () => void;

type BluetoothCharacteristic = {
  writeValueWithoutResponse?: (value: BufferSource) => Promise<void>;
  writeValue: (value: BufferSource) => Promise<void>;
  startNotifications: () => Promise<BluetoothCharacteristic>;
  addEventListener: (type: string, listener: (event: Event) => void) => void;
  value?: DataView;
};
type BluetoothDeviceLike = {
  id: string;
  name?: string;
  gatt?: { connected: boolean; connect: () => Promise<{ getPrimaryService: (uuid: string) => Promise<{ getCharacteristic: (uuid: string) => Promise<BluetoothCharacteristic> }> }>; disconnect: () => void };
  addEventListener: (type: string, listener: () => void) => void;
};
type AndroidBridge = { vibrate?: (ms: number) => void; pulseAvailable?: () => boolean };

function android(): AndroidBridge | null {
  return typeof window === "undefined" ? null : ((window as unknown as { BandivalAndroid?: AndroidBridge }).BandivalAndroid ?? null);
}

export function bluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

export function phoneVibrationSupported(): boolean {
  return Boolean(android()?.vibrate) || (typeof navigator !== "undefined" && "vibrate" in navigator && /Android/i.test(navigator.userAgent));
}

const SETTINGS_KEY = "bandival.pulse.settings";
const DEFAULT_SETTINGS: PulseSettings = { intensity: 170, accentIntensity: 255, pulseMs: 45, subdivisions: false, streamMode: false };

function loadSettings(): PulseSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<PulseSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

type Output = {
  device: PulseDevice;
  send?: (bytes: Uint8Array) => Promise<void>;
  disconnect: () => void;
};

class PulseHub {
  private outputs = new Map<string, Output>();
  private listeners = new Set<Listener>();
  private snapshot: { devices: PulseDevice[]; settings: PulseSettings; log: string[] } = { devices: [], settings: DEFAULT_SETTINGS, log: [] };
  private settingsLoaded = false;

  subscribe = (listener: Listener) => {
    if (!this.settingsLoaded) {
      this.settingsLoaded = true;
      this.snapshot = { ...this.snapshot, settings: loadSettings() };
    }
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  private emit() {
    this.snapshot = { ...this.snapshot, devices: Array.from(this.outputs.values()).map((output) => output.device) };
    this.listeners.forEach((listener) => listener());
  }

  private log(line: string) {
    this.snapshot = { ...this.snapshot, log: [`${new Date().toLocaleTimeString(intlLocale())} ${line}`, ...this.snapshot.log].slice(0, 40) };
    this.listeners.forEach((listener) => listener());
  }

  get settings(): PulseSettings {
    return this.snapshot.settings;
  }

  get active(): boolean {
    return Array.from(this.outputs.values()).some((output) => output.device.status === "connected");
  }

  updateSettings(patch: Partial<PulseSettings>) {
    const settings = { ...this.snapshot.settings, ...patch };
    this.snapshot = { ...this.snapshot, settings };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // per-viewer convenience only
    }
    void this.broadcast(encodeIntensity({ normal: settings.intensity, accent: settings.accentIntensity, pulseMs: settings.pulseMs }));
    this.emit();
  }

  private setDevice(id: string, patch: Partial<PulseDevice>) {
    const output = this.outputs.get(id);
    if (!output) return;
    output.device = { ...output.device, ...patch };
    this.emit();
  }

  /** Connects a Bandival Pulse wearable via Web Bluetooth. */
  async connectBluetooth(): Promise<void> {
    if (!bluetoothSupported()) throw new Error(t("Web Bluetooth wird von diesem Browser nicht unterstützt (Chrome/Edge auf Android, Windows, macOS)."));
    const bluetooth = (navigator as unknown as { bluetooth: { requestDevice: (options: unknown) => Promise<BluetoothDeviceLike> } }).bluetooth;
    let device: BluetoothDeviceLike;
    try {
      device = await bluetooth.requestDevice({
        filters: [{ services: [PULSE_SERVICE_UUID] }, { namePrefix: PULSE_DEVICE_NAME_PREFIX }],
        optionalServices: [PULSE_SERVICE_UUID, "battery_service"],
      });
    } catch (error) {
      if ((error as Error).name === "NotFoundError") {
        throw new Error(t("Kein Bandival-Pulse-Gerät gefunden. Das Gerät ist noch in Entwicklung – teste solange mit Handy-Vibration oder dem Simulator."));
      }
      throw error;
    }
    const id = `ble:${device.id}`;
    this.outputs.set(id, {
      device: { id, kind: "ble", label: device.name ?? PULSE_DEVICE_NAME_PREFIX, status: "connecting" },
      disconnect: () => device.gatt?.disconnect(),
    });
    this.emit();
    try {
      const server = await device.gatt!.connect();
      const service = await server.getPrimaryService(PULSE_SERVICE_UUID);
      const control = await service.getCharacteristic(PULSE_CONTROL_UUID);
      const status = await service.getCharacteristic(PULSE_STATUS_UUID);
      await status.startNotifications();
      status.addEventListener("characteristicvaluechanged", (event) => {
        const value = (event.target as unknown as BluetoothCharacteristic).value;
        if (!value) return;
        const decoded = decodeStatus(value);
        if (decoded.type === "state") this.setDevice(id, { battery: decoded.battery, firmware: decoded.firmware });
        if (decoded.type === "pong") this.setDevice(id, { latencyMs: Math.round(((performance.now() >>> 0) - decoded.value) / 2) });
        if (decoded.type === "error") this.log(t(`Gerät meldet Fehler ${decoded.code}`));
      });
      device.addEventListener("gattserverdisconnected", () => this.setDevice(id, { status: "disconnected" }));
      const output = this.outputs.get(id)!;
      output.send = async (bytes) => {
        const buffer = bytes.slice().buffer as ArrayBuffer;
        if (control.writeValueWithoutResponse) await control.writeValueWithoutResponse(buffer);
        else await control.writeValue(buffer);
      };
      await output.send(encodeHello());
      const settings = this.snapshot.settings;
      await output.send(encodeIntensity({ normal: settings.intensity, accent: settings.accentIntensity, pulseMs: settings.pulseMs }));
      await output.send(encodePing(performance.now() >>> 0));
      this.setDevice(id, { status: "connected" });
      this.log(`${device.name ?? t("Gerät")} verbunden`);
    } catch (error) {
      this.setDevice(id, { status: "error", error: (error as Error).message });
      throw error;
    }
  }

  enablePhone(): void {
    const id = "phone";
    if (this.outputs.has(id)) return;
    this.outputs.set(id, { device: { id, kind: "phone", label: t("Vibration dieses Handys"), status: "connected" }, disconnect: () => undefined });
    this.emit();
  }

  enableSimulator(): void {
    const id = "simulator";
    if (this.outputs.has(id)) return;
    this.outputs.set(id, {
      device: { id, kind: "simulator", label: t("Pulse-Simulator"), status: "connected", battery: 87, firmware: "sim" },
      send: async (bytes) => this.log(`→ ${describe(decodeCommand(bytes))}  [${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(" ")}]`),
      disconnect: () => undefined,
    });
    this.emit();
  }

  remove(id: string): void {
    const output = this.outputs.get(id);
    output?.disconnect();
    this.outputs.delete(id);
    this.emit();
  }

  private async broadcast(bytes: Uint8Array): Promise<void> {
    await Promise.all(Array.from(this.outputs.values()).map(async (output) => {
      if (output.device.status !== "connected" || !output.send) return;
      try {
        await output.send(bytes);
      } catch (error) {
        this.setDevice(output.device.id, { status: "error", error: (error as Error).message });
      }
    }));
  }

  /** Metronome started: devices with their own clock get START with a start delay. */
  start(config: MetronomeConfig, firstBeatEpochMs: number, songTitle?: string): void {
    if (!this.active) return;
    const params: StartParams = {
      bpm: config.bpm,
      beatsPerBar: config.beatsPerBar,
      beatUnit: config.beatUnit,
      subdivision: this.snapshot.settings.subdivisions ? config.subdivision : 1,
      accentMask: accentMaskFor(config.beatsPerBar),
      startInMs: Math.max(0, firstBeatEpochMs - Date.now() - (this.averageLatency() ?? 0)),
      countInBars: config.countInBars,
    };
    if (songTitle) void this.broadcast(encodeSong(songTitle));
    if (!this.snapshot.settings.streamMode) void this.broadcast(encodeStart(params));
  }

  tempo(bpm: number): void {
    if (this.active && !this.snapshot.settings.streamMode) void this.broadcast(encodeTempo(bpm));
  }

  stop(): void {
    if (this.active) void this.broadcast(encodeStop());
  }

  /** Called on every beat: phone vibration and stream-mode devices. */
  beat(info: BeatInfo): void {
    const settings = this.snapshot.settings;
    for (const output of this.outputs.values()) {
      if (output.device.status !== "connected") continue;
      if (output.device.kind === "phone") {
        const ms = Math.round(settings.pulseMs * (info.accent ? 1.6 : 1) * (info.accent ? settings.accentIntensity : settings.intensity) / 200);
        const bridge = android();
        if (bridge?.vibrate) bridge.vibrate(Math.max(10, ms));
        else navigator.vibrate?.(Math.max(10, ms));
      } else if (settings.streamMode && output.send) {
        void output.send(encodeBeat(info.beat, info.accent)).catch(() => undefined);
      }
    }
  }

  /** Sends a single test pulse to every output. */
  test(): void {
    this.beat({ beat: 0, bar: 0, countIn: false, accent: true, subdivision: false, epochMs: Date.now() });
    void this.broadcast(encodeBeat(0, true));
  }

  private averageLatency(): number | null {
    const values = Array.from(this.outputs.values()).map((output) => output.device.latencyMs).filter((value): value is number => typeof value === "number");
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  }
}

function describe(command: DecodedCommand): string {
  switch (command.op) {
    case "start": return t(`START ${command.bpm} BPM ${command.beatsPerBar}/${command.beatUnit} in ${command.startInMs} ms (Einzähler ${command.countInBars})`);
    case "tempo": return t(`TEMPO ${command.bpm} BPM`);
    case "beat": return `BEAT ${command.beatIndex + 1}${command.accent ? " (Akzent)" : ""}`;
    case "intensity": return `INTENSITY ${command.normal}/${command.accent} · ${command.pulseMs} ms`;
    case "song": return t(`SONG „${command.title}“`);
    case "hello": return `HELLO v${command.version}`;
    case "ping": return `PING ${command.value}`;
    case "stop": return "STOP";
    default: return `0x${command.code.toString(16)}`;
  }
}

export const pulseHub = new PulseHub();
