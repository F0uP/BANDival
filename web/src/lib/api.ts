import { z } from "zod";
import { AuthError } from "@/lib/auth";

const uuidSchema = z.string().uuid();

export function parseBandId(input: string | null): string {
  const parsed = uuidSchema.safeParse(input);
  if (!parsed.success) {
    throw new AuthError("Ungültige oder fehlende Band-ID.", 400);
  }

  return parsed.data;
}

export function parseUuid(input: string | null | undefined, label = "ID"): string {
  const parsed = uuidSchema.safeParse(input);
  if (!parsed.success) {
    throw new AuthError(`Ungültige ${label}.`, 400);
  }
  return parsed.data;
}

export function safeNumber(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
