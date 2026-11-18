import { AudioLines, Cloud, ExternalLink, Globe, Music, ShoppingBag } from "lucide-react";
import type { LinkKind } from "@/lib/social-links";

/** Simple monochrome platform glyphs (lucide no longer ships brand icons). */
export function SocialIcon({ kind, className = "size-[18px]" }: { kind: LinkKind; className?: string }) {
  const common = { className, viewBox: "0 0 24 24", "aria-hidden": true } as const;
  switch (kind) {
    case "instagram":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "spotify":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="12" cy="12" r="9.2" />
          <path d="M7.2 9.6c3.3-1 6.9-.7 9.8 1" />
          <path d="M7.8 12.7c2.7-.7 5.5-.4 7.8.9" />
          <path d="M8.4 15.6c2-.5 4-.3 5.7.6" />
        </svg>
      );
    case "youtube":
      return (
        <svg {...common} fill="currentColor">
          <path fillRule="evenodd" d="M21.6 7.2a2.6 2.6 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.6 2.6 0 0 0 2.4 7.2 27 27 0 0 0 2 12a27 27 0 0 0 .4 4.8 2.6 2.6 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.6 2.6 0 0 0 1.8-1.8A27 27 0 0 0 22 12a27 27 0 0 0-.4-4.8ZM10 15l5-3-5-3v6Z" />
        </svg>
      );
    case "tiktok":
      return (
        <svg {...common} fill="currentColor">
          <path d="M13.2 3h3.1a4.6 4.6 0 0 0 4.2 4.2v3.1a7.6 7.6 0 0 1-4.2-1.3v6.5a6 6 0 1 1-6-6h.6v3.2h-.6a2.8 2.8 0 1 0 2.9 2.8V3Z" />
        </svg>
      );
    case "facebook":
      return (
        <svg {...common} fill="currentColor">
          <path d="M13.6 21v-7.4h2.5l.4-3h-2.9V8.8c0-.9.3-1.5 1.5-1.5h1.5V4.6c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.3H8.2v3h2.5V21h2.9Z" />
        </svg>
      );
    case "bandcamp":
      return (
        <svg {...common} fill="currentColor">
          <path d="M2 18.5 8.3 5.5H22l-6.3 13H2Z" />
        </svg>
      );
    case "x":
      return (
        <svg {...common} fill="currentColor">
          <path d="M17.6 3.5h3.1l-6.8 7.8 8 10.2h-6.3l-4.9-6.4-5.6 6.4H2l7.3-8.4L1.6 3.5H8l4.4 5.8 5.2-5.8Zm-1.1 16.2h1.7L7.2 5.2H5.4l11.1 14.5Z" />
        </svg>
      );
    case "soundcloud":
      return <Cloud className={className} aria-hidden />;
    case "apple_music":
      return <Music className={className} aria-hidden />;
    case "deezer":
      return <AudioLines className={className} aria-hidden />;
    case "website":
      return <Globe className={className} aria-hidden />;
    case "merch":
      return <ShoppingBag className={className} aria-hidden />;
    default:
      return <ExternalLink className={className} aria-hidden />;
  }
}
