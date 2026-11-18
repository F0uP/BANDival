import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { IBM_Plex_Mono, Instrument_Sans } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/sw-register";

// Instrument Sans with its width axis: regular width for UI text, narrow width for headlines.
const sans = Instrument_Sans({ variable: "--font-ui", subsets: ["latin", "latin-ext"], axes: ["wdth"], display: "swap" });
// IBM Plex Mono for musical/technical metadata (BPM, keys, times, labels).
const mono = IBM_Plex_Mono({ variable: "--font-plex", subsets: ["latin", "latin-ext"], weight: ["400", "500", "600"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Bandival", template: "%s · Bandival" },
  description: "Self-hosted Band-Management: Songs, Setlists, Proben und Gigs an einem Ort.",
  manifest: "/manifest.webmanifest",
  applicationName: "Bandival",
  appleWebApp: { capable: true, title: "Bandival", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f2ef" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0c0f" },
  ],
};

/** Applies the stored theme before first paint to avoid a flash of the wrong theme. */
const themeScript = `(() => {
  try {
    var stored = localStorage.getItem("bandival.theme");
    var mode = stored === "light" || stored === "dark" ? stored : "system";
    var dark = mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  } catch (e) {
    document.documentElement.dataset.theme = "light";
  }
})();`;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Per-request nonce from the proxy's Content Security Policy (also makes every page render per request).
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="de" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh antialiased">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
