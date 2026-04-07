import { NextRequest, NextResponse } from "next/server";
import { AuthError, BAND_ROLE_MATRIX, getBandActionPermissions, getBandRole, requireAuthUser } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ bandId: string }> },
) {
  try {
    const session = await requireAuthUser(request);
    const { bandId } = await context.params;
    const role = await getBandRole(session.userId, bandId);

    return NextResponse.json({
      role,
      permissions: getBandActionPermissions(role),
      matrix: BAND_ROLE_MATRIX,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load permissions." },
      { status: 400 },
    );
  }
}
