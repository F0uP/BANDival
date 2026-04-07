import { z } from "zod";

export const defaultBandSchema = z.object({
  bandId: z.string().uuid(),
});

export function parseBandId(input: string | null): string {
  const parsed = defaultBandSchema.safeParse({ bandId: input });
  if (!parsed.success) {
    throw new Error("Invalid or missing bandId query parameter.");
  }

  return parsed.data.bandId;
}

export function safeNumber(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
