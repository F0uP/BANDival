/**
 * Bandival Pulse – BLE protocol v1 for haptic (vibrating) metronome wearables.
 *
 * The device runs its own clock: Bandival sends START with a start delay and the tempo, the device
 * vibrates on every beat until STOP. TEMPO changes apply at the next bar line. For very simple firmware
 * there is a fallback "stream mode" in which Bandival sends one BEAT command per beat.
 *
 * All multi-byte integers are little-endian. See docs/bandival-pulse.md for the full specification.
 */

export const PULSE_PROTOCOL_VERSION = 1;
export const PULSE_SERVICE_UUID = "6e0b0001-b5a3-4c7a-9a1d-62616e646976";
/** Write / write-without-response: commands from Bandival to the device. */
export const PULSE_CONTROL_UUID = "6e0b0002-b5a3-4c7a-9a1d-62616e646976";
/** Read / notify: status messages from the device. */
export const PULSE_STATUS_UUID = "6e0b0003-b5a3-4c7a-9a1d-62616e646976";
export const PULSE_DEVICE_NAME_PREFIX = "Bandival Pulse";

export const Op = {
  Hello: 0x00,
  Start: 0x01,
  Stop: 0x02,
  Tempo: 0x03,
  Intensity: 0x04,
  Ping: 0x05,
  Song: 0x06,
  Beat: 0x07,
} as const;

export const StatusOp = {
  State: 0x81,
  Pong: 0x85,
  Error: 0x8f,
} as const;

export type StartParams = {
  bpm: number;
  beatsPerBar: number;
  beatUnit: number;
  /** 1 = beats only, 2 = eighths, 3 = triplets, 4 = sixteenths (subdivisions are felt as weak pulses). */
  subdivision: 1 | 2 | 3 | 4;
  /** Bit n = beat n (0-based) is accented. */
  accentMask: number;
  /** Delay until the first beat – lets the device start exactly in sync with the audio click. */
  startInMs: number;
  countInBars: number;
};

export type IntensityParams = { normal: number; accent: number; pulseMs: number };

const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
const tempo10 = (bpm: number) => Math.max(200, Math.min(4000, Math.round(bpm * 10)));

export function encodeHello(): Uint8Array {
  return Uint8Array.of(Op.Hello, PULSE_PROTOCOL_VERSION);
}

export function encodeStart(params: StartParams): Uint8Array {
  const buffer = new DataView(new ArrayBuffer(13));
  buffer.setUint8(0, Op.Start);
  buffer.setUint16(1, tempo10(params.bpm), true);
  buffer.setUint8(3, clampByte(params.beatsPerBar));
  buffer.setUint8(4, clampByte(params.beatUnit));
  buffer.setUint8(5, clampByte(params.subdivision));
  buffer.setUint16(6, params.accentMask & 0xffff, true);
  buffer.setUint32(8, Math.max(0, Math.round(params.startInMs)), true);
  buffer.setUint8(12, clampByte(params.countInBars));
  return new Uint8Array(buffer.buffer);
}

export function encodeStop(): Uint8Array {
  return Uint8Array.of(Op.Stop);
}

export function encodeTempo(bpm: number): Uint8Array {
  const value = tempo10(bpm);
  return Uint8Array.of(Op.Tempo, value & 0xff, value >> 8);
}

export function encodeIntensity(params: IntensityParams): Uint8Array {
  return Uint8Array.of(Op.Intensity, clampByte(params.normal), clampByte(params.accent), clampByte(params.pulseMs));
}

export function encodePing(value: number): Uint8Array {
  const buffer = new DataView(new ArrayBuffer(5));
  buffer.setUint8(0, Op.Ping);
  buffer.setUint32(1, value >>> 0, true);
  return new Uint8Array(buffer.buffer);
}

/** Song title for devices with a small display (UTF-8, max. 40 bytes). */
export function encodeSong(title: string): Uint8Array {
  const bytes = new TextEncoder().encode(title).slice(0, 40);
  return Uint8Array.of(Op.Song, bytes.length, ...bytes);
}

export function encodeBeat(beatIndex: number, accent: boolean, subdivision = false): Uint8Array {
  return Uint8Array.of(Op.Beat, clampByte(beatIndex), (accent ? 1 : 0) | (subdivision ? 2 : 0));
}

export type DecodedCommand =
  | { op: "hello"; version: number }
  | ({ op: "start" } & StartParams)
  | { op: "stop" }
  | { op: "tempo"; bpm: number }
  | ({ op: "intensity" } & IntensityParams)
  | { op: "ping"; value: number }
  | { op: "song"; title: string }
  | { op: "beat"; beatIndex: number; accent: boolean; subdivision: boolean }
  | { op: "unknown"; code: number };

/** Decodes a command (used by the built-in simulator and by firmware tests). */
export function decodeCommand(bytes: Uint8Array): DecodedCommand {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  switch (bytes[0]) {
    case Op.Hello:
      return { op: "hello", version: bytes[1] ?? 0 };
    case Op.Start:
      return {
        op: "start",
        bpm: view.getUint16(1, true) / 10,
        beatsPerBar: view.getUint8(3),
        beatUnit: view.getUint8(4),
        subdivision: Math.min(4, Math.max(1, view.getUint8(5))) as StartParams["subdivision"],
        accentMask: view.getUint16(6, true),
        startInMs: view.getUint32(8, true),
        countInBars: view.getUint8(12),
      };
    case Op.Stop:
      return { op: "stop" };
    case Op.Tempo:
      return { op: "tempo", bpm: view.getUint16(1, true) / 10 };
    case Op.Intensity:
      return { op: "intensity", normal: bytes[1], accent: bytes[2], pulseMs: bytes[3] };
    case Op.Ping:
      return { op: "ping", value: view.getUint32(1, true) };
    case Op.Song:
      return { op: "song", title: new TextDecoder().decode(bytes.slice(2, 2 + (bytes[1] ?? 0))) };
    case Op.Beat:
      return { op: "beat", beatIndex: bytes[1], accent: Boolean(bytes[2] & 1), subdivision: Boolean(bytes[2] & 2) };
    default:
      return { op: "unknown", code: bytes[0] };
  }
}

export type DeviceStatus =
  | { type: "state"; battery: number; running: boolean; bpm: number; firmware: string }
  | { type: "pong"; value: number }
  | { type: "error"; code: number }
  | { type: "unknown" };

export function decodeStatus(view: DataView): DeviceStatus {
  const op = view.getUint8(0);
  if (op === StatusOp.State && view.byteLength >= 7) {
    return { type: "state", battery: view.getUint8(1), running: view.getUint8(2) === 1, bpm: view.getUint16(3, true) / 10, firmware: `${view.getUint8(5)}.${view.getUint8(6)}` };
  }
  if (op === StatusOp.Pong && view.byteLength >= 5) return { type: "pong", value: view.getUint32(1, true) };
  if (op === StatusOp.Error && view.byteLength >= 2) return { type: "error", code: view.getUint8(1) };
  return { type: "unknown" };
}

export function accentMaskFor(beatsPerBar: number, accents: number[] = [0]): number {
  return accents.filter((beat) => beat < Math.min(16, beatsPerBar)).reduce((mask, beat) => mask | (1 << beat), 0);
}
