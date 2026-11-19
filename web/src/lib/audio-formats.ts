/**
 * Audio formats accepted for uploads (shared by server validation and file pickers).
 * Anything ffmpeg can read – including the odd formats phone recorders produce – plus videos
 * with a sound track. Uploads are converted to MP3 on the server.
 */
export const AUDIO_EXTENSIONS = [
  // common
  ".mp3", ".m4a", ".aac", ".wav", ".wave", ".flac", ".ogg", ".oga", ".opus", ".webm", ".weba",
  // Apple (Voice Memos, GarageBand, Logic exports)
  ".caf", ".aif", ".aiff", ".aifc", ".m4b", ".m4r", ".alac",
  // Android / mobile recorders, WhatsApp
  ".amr", ".awb", ".3gp", ".3gpp", ".3ga", ".3g2", ".qcp",
  // others
  ".wma", ".asf", ".mka", ".ac3", ".eac3", ".dts", ".ape", ".wv", ".tta", ".mpc", ".spx", ".au", ".snd", ".mp2", ".mpga", ".ra", ".rm", ".voc", ".w64", ".rf64",
  // videos with a sound track (rehearsal clips, screen recordings)
  ".mp4", ".m4v", ".mov", ".mkv", ".avi", ".wmv", ".mts", ".m2ts",
] as const;

/** For `<input type="file" accept>`: MIME wildcards plus extensions some systems don't map to audio/*. */
export const AUDIO_ACCEPT = ["audio/*", "video/*", ...AUDIO_EXTENSIONS].join(",");
