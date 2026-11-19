import { Fragment, type ReactNode } from "react";

/**
 * Minimal, safe Markdown for the legal pages (no HTML, no dangerouslySetInnerHTML):
 * #/##/### headings, paragraphs (single line breaks are kept – handy for addresses),
 * "- " and "1. " lists, --- rules, **bold**, *italic*, [links](https://…), bare URLs and e-mail addresses.
 */

type Block =
  | { kind: "h1" | "h2" | "h3"; text: string }
  | { kind: "p"; lines: string[] }
  | { kind: "ul" | "ol"; items: string[] }
  | { kind: "hr" };

function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { kind: "ul" | "ol"; items: string[] } | null = null;
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: "p", lines: paragraph });
    if (list) blocks.push(list);
    paragraph = [];
    list = null;
  };
  for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (!line.trim()) { flush(); continue; }
    if (heading) {
      flush();
      blocks.push({ kind: (["h1", "h2", "h3"] as const)[heading[1].length - 1], text: heading[2] });
    } else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      flush();
      blocks.push({ kind: "hr" });
    } else if (bullet || numbered) {
      const kind = bullet ? "ul" : "ol";
      if (paragraph.length || (list && list.kind !== kind)) flush();
      list ??= { kind, items: [] };
      list.items.push((bullet ?? numbered)![1]);
    } else if (list && /^\s{2,}/.test(raw)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`;
    } else {
      if (list) flush();
      paragraph.push(line.trim());
    }
  }
  flush();
  return blocks;
}

function safeHref(href: string): string | null {
  const value = href.trim();
  if (/^(https?:\/\/|mailto:|tel:)/i.test(value)) return value;
  if (/^\/(?!\/)/.test(value) || value.startsWith("#")) return value;
  return null;
}

const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[[^\]]+\]\([^)\s]+\)|https?:\/\/[^\s<>()]+[^\s<>().,;:!?]|[\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g;

function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(INLINE)) {
    const token = match[0];
    const start = match.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    const key = `${keyPrefix}-${index++}`;
    if (token.startsWith("**")) out.push(<strong key={key} className="font-semibold text-fg">{inline(token.slice(2, -2), key)}</strong>);
    else if (token.startsWith("*")) out.push(<em key={key}>{inline(token.slice(1, -1), key)}</em>);
    else if (token.startsWith("[")) {
      const [, label, href] = token.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/) ?? [];
      const safe = href ? safeHref(href) : null;
      out.push(safe ? <a key={key} href={safe} className="text-accent-text underline-offset-2 hover:underline" rel={safe.startsWith("http") ? "noopener noreferrer" : undefined}>{label}</a> : label);
    } else if (token.includes("@") && !token.startsWith("http")) {
      out.push(<a key={key} href={`mailto:${token}`} className="text-accent-text underline-offset-2 hover:underline">{token}</a>);
    } else {
      out.push(<a key={key} href={token} className="break-all text-accent-text underline-offset-2 hover:underline" rel="noopener noreferrer">{token}</a>);
    }
    last = start + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function LegalMarkdown({ source }: { source: string }) {
  return (
    <div className="legal-prose">
      {parseBlocks(source).map((block, index) => {
        const key = `b${index}`;
        switch (block.kind) {
          case "h1": return <h1 key={key} className="type-display mb-6 text-[34px] leading-[1.05] sm:text-[44px]">{inline(block.text, key)}</h1>;
          case "h2": return <h2 key={key} className="mb-2 mt-9 text-[19px] font-semibold tracking-tight">{inline(block.text, key)}</h2>;
          case "h3": return <h3 key={key} className="mb-2 mt-6 text-[16px] font-semibold">{inline(block.text, key)}</h3>;
          case "hr": return <hr key={key} className="my-8 border-border" />;
          case "ul":
          case "ol": {
            const List = block.kind;
            return (
              <List key={key} className={`my-3 space-y-1.5 pl-5 text-[15px] leading-relaxed text-muted ${block.kind === "ul" ? "list-disc" : "list-decimal"}`}>
                {block.items.map((item, itemIndex) => <li key={itemIndex}>{inline(item, `${key}-${itemIndex}`)}</li>)}
              </List>
            );
          }
          default:
            return (
              <p key={key} className="my-3 text-[15px] leading-relaxed text-muted">
                {block.lines.map((line, lineIndex) => (
                  <Fragment key={lineIndex}>{lineIndex > 0 ? <br /> : null}{inline(line, `${key}-${lineIndex}`)}</Fragment>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}
