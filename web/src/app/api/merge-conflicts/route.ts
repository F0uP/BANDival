import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthUser } from "@/lib/auth";
import { errorResponse } from "@/lib/http";

/** The current user's merge conflicts (open ones first, plus the last resolved). */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuthUser(request);
    const all = request.nextUrl.searchParams.get("all") === "1";
    const conflicts = await prisma.mergeConflict.findMany({
      where: { userId: session.userId, ...(all ? {} : { status: "open" }) },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: all ? 50 : 20,
      select: { id: true, bandId: true, docType: true, docId: true, docTitle: true, docUrl: true, theirsName: true, labels: true, status: true, createdAt: true, resolvedAt: true },
    });
    return NextResponse.json({ conflicts, open: conflicts.filter((conflict) => conflict.status === "open").length });
  } catch (error) {
    return errorResponse(error);
  }
}
