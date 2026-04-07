import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseBandId } from "@/lib/api";
import { requireAuthUser, requireBandMembership } from "@/lib/auth";

const createAlbumSchema = z.object({
  bandId: z.string().uuid(),
  title: z.string().min(1).max(200),
  coverUrl: z.string().url().nullable().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseBandId(request.nextUrl.searchParams.get("bandId"));
    await requireBandMembership(session.userId, bandId);

    const albums = await prisma.album.findMany({
      where: { bandId },
      include: {
        songs: {
          orderBy: [{ albumTrackNo: "asc" }, { title: "asc" }],
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ albums });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch albums." },
      { status: 400 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const payload = createAlbumSchema.parse(await request.json());
    await requireBandMembership(session.userId, payload.bandId);
    const album = await prisma.album.create({
      data: {
        bandId: payload.bandId,
        title: payload.title,
        coverUrl: payload.coverUrl ?? null,
      },
    });

    return NextResponse.json({ album }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create album." },
      { status: 400 },
    );
  }
}
