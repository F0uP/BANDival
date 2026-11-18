import { NextRequest, NextResponse } from "next/server";
import { BAND_ROLE_MATRIX, getBandActionPermissions, getBandRole, requireAuthUser } from "@/lib/auth";
import { parseUuid } from "@/lib/api";
import { errorResponse } from "@/lib/http";

export async function GET(request: NextRequest, context: { params: Promise<{ bandId: string }> }) {
  try {
    const session = await requireAuthUser(request);
    const bandId = parseUuid((await context.params).bandId, "Band-ID");
    const role = await getBandRole(session.userId, bandId);

    return NextResponse.json({
      role,
      permissions: getBandActionPermissions(role),
      matrix: BAND_ROLE_MATRIX,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
