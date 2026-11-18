import { Suspense } from "react";
import { VerifyEmailScreen } from "@/components/auth/token-pages";

export const metadata = { title: "E-Mail bestätigen" };

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailScreen />
    </Suspense>
  );
}
