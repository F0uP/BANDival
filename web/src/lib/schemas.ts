import type { Prisma } from "@prisma/client";
import { z } from "zod";

const optionalUrl = z
  .union([z.string().trim().url("Ungültige URL."), z.literal("")])
  .nullable()
  .optional()
  .transform((value) => (value === undefined ? undefined : value || null));

export const songInputSchema = z.object({
  title: z.string().trim().min(1, "Bitte einen Titel angeben.").max(200),
  workflowStatus: z.enum(["draft", "review", "approved", "archived"]).optional(),
  albumId: z.string().uuid().nullable().optional(),
  albumTrackNo: z.number().int().min(1).max(999).nullable().optional(),
  keySignature: z.string().trim().max(20).nullable().optional(),
  tempoBpm: z.number().min(20).max(400).nullable().optional(),
  durationSeconds: z.number().int().min(1).max(36000).nullable().optional(),
  timeSignature: z.string().trim().regex(/^\d{1,2}\/(1|2|4|8|16)$/, "Taktart z. B. 4/4 oder 6/8").nullable().optional(),
  isPublic: z.boolean().optional(),
  spotifyUrl: optionalUrl,
  notes: z.string().max(5000).nullable().optional(),
  chordProText: z.string().max(50000).nullable().optional(),
  lyricsMarkdown: z.string().max(20000).nullable().optional(),
});

export const songListSelect = {
  id: true,
  title: true,
  workflowStatus: true,
  keySignature: true,
  tempoBpm: true,
  durationSeconds: true,
  timeSignature: true,
  isPublic: true,
  spotifyUrl: true,
  albumId: true,
  albumTrackNo: true,
  createdAt: true,
  updatedAt: true,
  album: { select: { id: true, title: true, coverUrl: true } },
  audioVersions: {
    where: { isCurrent: true },
    take: 1,
    select: { id: true, fileUrl: true, fileName: true },
  },
  _count: { select: { audioVersions: true, attachments: true, threads: true, setlistItems: true } },
} as const;

export const setlistDetailInclude = {
  items: {
    orderBy: { position: "asc" },
    include: {
      song: {
        select: {
          id: true,
          title: true,
          keySignature: true,
          tempoBpm: true,
          durationSeconds: true,
          timeSignature: true,
          workflowStatus: true,
          audioVersions: { where: { isCurrent: true }, take: 1, select: { id: true, fileUrl: true, fileName: true } },
        },
      },
    },
  },
  events: {
    where: { status: { notIn: ["cancelled", "availability_template"] } },
    orderBy: { startsAt: "asc" },
    select: { id: true, title: true, startsAt: true, kind: true, venueLabel: true },
  },
} satisfies Prisma.SetlistInclude;

export const albumSongSelect = {
  id: true,
  title: true,
  albumTrackNo: true,
  durationSeconds: true,
  keySignature: true,
  tempoBpm: true,
  workflowStatus: true,
} as const;
