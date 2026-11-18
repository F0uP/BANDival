import { Suspense } from "react";
import { ResetPasswordScreen } from "@/components/auth/token-pages";

export const metadata = { title: "Passwort zurücksetzen" };

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordScreen />
    </Suspense>
  );
}
