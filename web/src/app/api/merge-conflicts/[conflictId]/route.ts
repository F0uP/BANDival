import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthUser, writeAuditLog } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";
import { conflictBody, conflictView, discardConflict, resolveConflict } from "@/lib/merge/server";

type Context = { params: Promise<{ conflictId: string }> };

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("resolve"),
    choices: z.record(z.string(), z.object({ option: z.string().max(40).optional(), value: z.unknown().optional() })),
  }),
  z.object({ action: z.literal("discard") }),
]);

export async function GET(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const conflictId = parseUuid((await context.params).conflictId, "Konflikt-ID");
    return NextResponse.json(await conflictView(conflictId, session.userId));
  } catch (error) {
    return errorResponse(error);
  }
}

/** Resolve (apply the chosen proposals) or discard (keep the other version). */
export async function POST(request: NextRequest, context: Context) {
  try {
    const session = await requireAuthUser(request);
    const conflictId = parseUuid((await context.params).conflictId, "Konflikt-ID");
    const payload = actionSchema.parse(await request.json());
    if (payload.action === "discard") {
      await discardConflict(conflictId, session.userId);
      return NextResponse.json({ ok: true });
    }
    const view = await conflictView(conflictId, session.userId);
    const outcome = await resolveConflict(conflictId, session.userId, payload.choices);
    await writeAuditLog({
      bandId: view.conflict.bandId,
      actorUserId: session.userId,
      action: "merge_resolved",
      entityType: view.conflict.docType,
      entityId: view.conflict.docId,
      payload: { title: view.conflict.docTitle, conflictId },
    });
    if (outcome.status === "conflict") return NextResponse.json(conflictBody(outcome), { status: 409 });
    return NextResponse.json({ ok: true, status: outcome.status, revision: outcome.revision, url: view.conflict.docUrl });
  } catch (error) {
    return errorResponse(error, "Konflikt konnte nicht gelöst werden.");
  }
}
