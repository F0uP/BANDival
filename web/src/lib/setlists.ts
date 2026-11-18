import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { setlistDetailInclude } from "@/lib/schemas";

const LEGACY_META_MARKER = "[bandival-meta]";

/** Older versions stored instruments/equipment as JSON inside the description. */
export function decodeLegacyDescription(description: string | null): {
  description: string | null;
  instruments: string[];
  equipment: string[];
} {
  if (!description || !description.includes(LEGACY_META_MARKER)) {
    return { description, instruments: [], equipment: [] };
  }
  const index = description.indexOf(LEGACY_META_MARKER);
  const plain = description.slice(0, index).trim() || null;
  try {
    const meta = JSON.parse(description.slice(index + LEGACY_META_MARKER.length).trim()) as {
      instruments?: unknown;
      equipment?: unknown;
    };
    const asList = (value: unknown) => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []);
    return { description: plain, instruments: asList(meta.instruments), equipment: asList(meta.equipment) };
  } catch {
    return { description: plain, instruments: [], equipment: [] };
  }
}

export function normalizeTags(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, 40);
}

type SetlistWithDetails = Prisma.SetlistGetPayload<{ include: typeof setlistDetailInclude }>;

export function presentSetlist(setlist: SetlistWithDetails) {
  const legacy = decodeLegacyDescription(setlist.description);
  const totalSeconds = setlist.items.reduce((sum, item) => sum + (item.customDurationSeconds ?? item.song.durationSeconds ?? 0), 0);
  return {
    ...setlist,
    description: legacy.description,
    instruments: setlist.instruments.length > 0 ? setlist.instruments : legacy.instruments,
    equipment: setlist.equipment.length > 0 ? setlist.equipment : legacy.equipment,
    totalSeconds,
  };
}

export async function loadSetlist(setlistId: string) {
  const setlist = await prisma.setlist.findUnique({ where: { id: setlistId }, include: setlistDetailInclude });
  return setlist ? presentSetlist(setlist) : null;
}

/**
 * Rewrites positions without violating the (setlistId, position) unique constraint:
 * first move everything to a temporary out-of-range block, then assign the final order.
 */
export async function applySetlistOrder(tx: Prisma.TransactionClient, setlistId: string, orderedItemIds: string[]): Promise<void> {
  await tx.setlistItem.updateMany({
    where: { setlistId },
    data: { position: { increment: 100000 } },
  });
  for (const [index, itemId] of orderedItemIds.entries()) {
    await tx.setlistItem.update({ where: { id: itemId }, data: { position: index + 1 } });
  }
}
