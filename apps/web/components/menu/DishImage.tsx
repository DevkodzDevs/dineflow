"use client";
import type { ImgHTMLAttributes } from "react";
import { photoAt } from "@/lib/dishPhotos";

/**
 * A dish photo at the size it is drawn (2026-10-22, the owner: "a lightweight feel"). It asks Wikimedia for the smallest
 * thumbnail that covers `w` px (`photoAt`), and falls back to the stored photo if that file does not come — an original
 * narrower than the step, a thumbnail Wikimedia is slow to render (it answers 429 when pressed), anything. So a tile is
 * never left with a broken picture for the sake of a smaller file. The check on mount catches an error that happened
 * before React was listening (a server-rendered image fails before hydration).
 */
export function DishImage({ src, w, alt = "", ...rest }: { src: string; w: number } & Omit<ImgHTMLAttributes<HTMLImageElement>, "src">) {
  const small = photoAt(src, w);
  const back = (i: HTMLImageElement | null) => { if (i && i.getAttribute("src") !== src) i.src = src; };
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Wikimedia or the property's own upload; next/image would need every host allow-listed
    <img src={small} alt={alt} loading="lazy" decoding="async" {...rest}
      ref={(i) => { if (i && small !== src && i.complete && i.naturalWidth === 0 && i.currentSrc) back(i); }}
      onError={(e) => back(e.currentTarget)} />
  );
}
