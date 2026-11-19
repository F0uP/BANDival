import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Landing } from "@/components/landing/landing";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { getRegistrationMode } from "@/lib/tokens";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: { absolute: t("Bandival – Band-Management, self-hosted") },
    description: t("Songs, Lead Sheets, Setlists, Proben, Gigs und Bandkasse an einem Ort – mit synchronem Live-Click ohne Internet. Self-hosted mit Docker."),
    openGraph: {
      title: t("Bandival – Weniger Orga. Mehr Musik."),
      description: t("Self-hosted Band-Management: Songs, Setlists, Proben, Gigs, Bandkasse und ein Live-Modus, der auf der Bühne synchron klickt."),
      type: "website",
    },
  };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Landing page. Old links (/?next=…, invite and token links) still lead to the login,
 * and self-hosters can switch the page off with LANDING_PAGE=false.
 */
export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const forward = new URLSearchParams();
  for (const key of ["next", "inviteToken", "token", "mode"]) {
    const value = params[key];
    if (typeof value === "string" && value) forward.set(key, value);
  }
  if (forward.size > 0 || process.env.LANDING_PAGE === "false") {
    redirect(forward.size > 0 ? `/login?${forward.toString()}` : "/login");
  }
  const signedIn = Boolean((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  return <Landing signedIn={signedIn} registrationOpen={getRegistrationMode() === "open"} />;
}
