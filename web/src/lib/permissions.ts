export type BandRole = "owner" | "admin" | "member" | "guest";

export type BandAction =
  | "band.manage"
  | "songs.create"
  | "songs.delete"
  | "setlists.create"
  | "setlists.delete"
  | "events.create"
  | "events.manage"
  | "invites.manage"
  | "members.manage"
  | "availability.update"
  | "backup.export"
  | "backup.restore"
  | "finance.view"
  | "finance.manage"
  | "public.manage"
  | "ideas.create"
  | "events.log";

export const BAND_ROLE_MATRIX: Record<BandAction, BandRole[]> = {
  "band.manage": ["owner", "admin"],
  "songs.create": ["owner", "admin", "member"],
  "songs.delete": ["owner", "admin"],
  "setlists.create": ["owner", "admin", "member"],
  "setlists.delete": ["owner", "admin"],
  "events.create": ["owner", "admin"],
  "events.manage": ["owner", "admin"],
  "invites.manage": ["owner", "admin"],
  "members.manage": ["owner", "admin"],
  "availability.update": ["owner", "admin", "member"],
  "backup.export": ["owner", "admin"],
  "backup.restore": ["owner"],
  "finance.view": ["owner", "admin", "member"],
  "finance.manage": ["owner", "admin"],
  "public.manage": ["owner", "admin"],
  "ideas.create": ["owner", "admin", "member"],
  "events.log": ["owner", "admin", "member"],
};

export const ROLE_LABELS: Record<BandRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Mitglied",
  guest: "Gast",
};

export function roleCan(role: BandRole | null | undefined, action: BandAction): boolean {
  if (!role) {
    return false;
  }
  return BAND_ROLE_MATRIX[action].includes(role);
}

export function getBandActionPermissions(role: BandRole): Record<BandAction, boolean> {
  return Object.fromEntries(
    (Object.keys(BAND_ROLE_MATRIX) as BandAction[]).map((action) => [action, roleCan(role, action)]),
  ) as Record<BandAction, boolean>;
}
