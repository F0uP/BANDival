import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "@/lib/auth";

export class HttpError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function formatZodError(error: ZodError): string {
  const first = error.issues[0];
  if (!first) {
    return "Ungültige Eingabe.";
  }
  const field = first.path.length > 0 ? `${first.path.join(".")}: ` : "";
  return `Ungültige Eingabe – ${field}${first.message}`;
}

/** Converts any thrown error into a consistent JSON error response. */
export function errorResponse(error: unknown, fallback = "Unerwarteter Fehler."): NextResponse {
  if (error instanceof AuthError || error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof ZodError) {
    return NextResponse.json({ error: formatZodError(error) }, { status: 400 });
  }

  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "Ungültiger Request-Body." }, { status: 400 });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") {
      return NextResponse.json({ error: "Eintrag nicht gefunden." }, { status: 404 });
    }
    if (error.code === "P2002") {
      return NextResponse.json({ error: "Eintrag existiert bereits." }, { status: 409 });
    }
    if (error.code === "P2003") {
      return NextResponse.json({ error: "Eintrag wird noch verwendet und kann nicht geändert werden." }, { status: 409 });
    }
  }

  console.error("[api]", error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

/** JSON.stringify-safe clone (BigInt -> string, Decimal -> number via toJSON). */
export function toJsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, current) => (typeof current === "bigint" ? current.toString() : current)),
  ) as T;
}

export function json<T>(value: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(toJsonSafe(value), init);
}
