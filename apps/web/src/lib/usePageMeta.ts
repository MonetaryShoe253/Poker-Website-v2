import { useEffect } from "react";

/** Per-page title/description for SEO and link unfurls. */
export function usePageMeta(title: string, description?: string): void {
  useEffect(() => {
    document.title = title ? `${title} — UOS Poker` : "UOS Poker — University of Sheffield Poker Society";
    if (description) {
      let tag = document.querySelector<HTMLMetaElement>('meta[name="description"]');
      if (!tag) {
        tag = document.createElement("meta");
        tag.name = "description";
        document.head.appendChild(tag);
      }
      tag.content = description;
    }
  }, [title, description]);
}
