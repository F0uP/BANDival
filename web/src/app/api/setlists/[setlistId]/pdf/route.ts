import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertSetlistAccess, requireAuthUser } from "@/lib/auth";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ setlistId: string }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { setlistId } = await context.params;
    await assertSetlistAccess(session.userId, setlistId);

    const setlist = await prisma.setlist.findUnique({
      where: { id: setlistId },
      include: {
        items: {
          orderBy: { position: "asc" },
          include: { song: true },
        },
      },
    });

    if (!setlist) {
      return NextResponse.json({ error: "Setlist not found." }, { status: 404 });
    }

    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage([595.28, 841.89]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    page.drawText(setlist.name, {
      x: 50,
      y: 790,
      size: 24,
      font: bold,
      color: rgb(0.09, 0.14, 0.19),
    });

    page.drawText(`Exported: ${new Date().toLocaleDateString("de-DE")}`, {
      x: 50,
      y: 768,
      size: 10,
      font,
      color: rgb(0.3, 0.3, 0.35),
    });

    let currentY = 730;
    for (const item of setlist.items) {
      page.drawText(`${item.position}. ${item.song.title}`, {
        x: 52,
        y: currentY,
        size: 13,
        font: bold,
        color: rgb(0.12, 0.2, 0.23),
      });
      if (item.transitionNotes) {
        page.drawText(item.transitionNotes, {
          x: 70,
          y: currentY - 14,
          size: 10,
          font,
          color: rgb(0.3, 0.3, 0.35),
        });
        currentY -= 18;
      }
      currentY -= 22;
      if (currentY < 70) {
        currentY = 760;
        page = pdfDoc.addPage([595.28, 841.89]);
      }
    }

    const pdfBytes = await pdfDoc.save();
    const fileName = `setlist-${setlist.id}-${Date.now()}.pdf`;
    const relativePath = path.join("exports", fileName);
    const absoluteDir = path.join(process.cwd(), "public", "exports");

    await mkdir(absoluteDir, { recursive: true });
    await writeFile(path.join(absoluteDir, fileName), pdfBytes);

    const setlistUpdated = await prisma.setlist.update({
      where: { id: setlist.id },
      data: {
        pdfExportUrl: `/${relativePath.replaceAll("\\", "/")}`,
      },
    });

    return NextResponse.json({ setlist: setlistUpdated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to export PDF." },
      { status: 400 },
    );
  }
}
