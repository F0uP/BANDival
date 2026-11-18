import { randomBytes } from "node:crypto";

export function createBandSlug(base: string): string {
  const cleaned = base
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${cleaned || "band"}-${randomBytes(4).toString("hex")}`;
}
