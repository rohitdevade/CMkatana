import { useEffect, useState } from "react";
import { continueRender, delayRender } from "remotion";

const loaded = new Set<string>();

function cssUrl(families: string[]): string {
  const params = families
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:ital,wght@0,100..900;1,100..900`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${params}&display=block`;
}

async function loadCss(href: string): Promise<void> {
  // Variable-axis request first; fall back to the plain family if the font has no weight axis.
  const ok = await new Promise<boolean>((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onload = () => resolve(true);
    link.onerror = () => {
      link.remove();
      resolve(false);
    };
    document.head.appendChild(link);
  });
  if (!ok) throw new Error(`font css failed: ${href}`);
}

async function loadFamily(family: string): Promise<void> {
  try {
    await loadCss(cssUrl([family]));
  } catch {
    await loadCss(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}&display=block`);
  }
  await Promise.all([400, 700].map((w) => document.fonts.load(`${w} 32px "${family}"`)));
}

/** Loads Google Fonts used by the spec and blocks rendering until they are ready. */
export function useGoogleFonts(families: string[]): void {
  const key = [...new Set(families)].filter((f) => !loaded.has(f)).sort().join("|");
  const [handle] = useState(() => (key ? delayRender(`Loading fonts: ${key}`, { timeoutInMilliseconds: 60000 }) : null));

  useEffect(() => {
    if (handle === null) return;
    const pending = key.split("|").filter(Boolean);
    Promise.allSettled(pending.map(loadFamily)).then((results) => {
      results.forEach((r, i) => {
        if (r.status === "fulfilled") loaded.add(pending[i]);
        else console.warn(`Font "${pending[i]}" unavailable, using fallback`);
      });
      continueRender(handle);
    });
  }, [handle, key]);
}
