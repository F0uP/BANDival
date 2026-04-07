import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertSetlistAccess, requireAuthUser, writeAuditLog } from "@/lib/auth";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ setlistId: string }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { setlistId } = await context.params;
    await assertSetlistAccess(session.userId, setlistId);

    const original = await prisma.setlist.findUnique({
      where: { id: setlistId },
      include: {
        items: {
          orderBy: { position: "asc" },
        },
      },
    });

    if (!original) {
      return NextResponse.json({ error: "Setlist not found." }, { status: 404 });
    }

    const copied = await prisma.setlist.create({
      data: {
        bandId: original.bandId,
        name: `${original.name} (Copy)`,
        description: original.description,
        copiedFromSetlistId: original.id,
        coverImageUrl: original.coverImageUrl,
        items: {
          create: original.items.map((item) => ({
            songId: item.songId,
            position: item.position,
            transitionNotes: item.transitionNotes,
            customKeySignature: item.customKeySignature,
            customTempoBpm: item.customTempoBpm,
            customDurationSeconds: item.customDurationSeconds,
          })),
        },
      },
      include: {
        items: {
          orderBy: { position: "asc" },
          include: { song: true },
        },
      },
    });

    await writeAuditLog({
      bandId: copied.bandId,
      actorUserId: session.userId,
      action: "setlist_copied",
      entityType: "setlist",
      entityId: copied.id,
      payload: { sourceSetlistId: original.id },
    });

    return NextResponse.json({ setlist: copied }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to copy setlist." },
      { status: 400 },
    );
  }
}
