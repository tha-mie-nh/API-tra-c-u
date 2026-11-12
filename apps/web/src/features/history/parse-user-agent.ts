export interface ParsedUserAgent {
  browser: string | null;
  os: string | null;
}

/** Ordered: first match wins (Edge/Opera UAs also contain "Chrome"; Chrome's contains "Safari"). */
const BROWSERS: [string, RegExp][] = [
  ['Edge', /\bEdg(?:e|A|iOS)?\/([\d.]+)/],
  ['Opera', /\bOPR\/([\d.]+)/],
  ['Firefox', /\b(?:Firefox|FxiOS)\/([\d.]+)/],
  ['Chrome', /\b(?:Chrome|CriOS)\/([\d.]+)/],
  ['Safari', /\bVersion\/([\d.]+).*\bSafari\//],
  ['curl', /\bcurl\/([\d.]+)/],
  ['Postman', /\bPostmanRuntime\/([\d.]+)/],
];

const OSES: [string, RegExp][] = [
  ['Windows', /Windows NT/],
  ['Android', /Android/],
  ['iOS', /iPhone|iPad|iPod/],
  ['macOS', /Mac OS X|Macintosh/],
  ['Linux', /Linux|X11/],
];

/** Tiny regex parser (no dependency): "Chrome 120" + "Windows"; null parts when unknown. Display only. */
export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  if (!ua) return { browser: null, os: null };
  let browser: string | null = null;
  for (const [name, re] of BROWSERS) {
    const m = re.exec(ua);
    if (m?.[1]) {
      browser = `${name} ${m[1].split('.')[0]}`;
      break;
    }
  }
  // Android/iOS UAs also contain "Linux"/"Mac OS X" — OSES order handles it.
  const os = OSES.find(([, re]) => re.test(ua))?.[0] ?? null;
  return { browser, os };
}

export function describeUserAgent(ua: string | null | undefined): string | null {
  const { browser, os } = parseUserAgent(ua);
  const parts = [browser, os].filter(Boolean);
  return parts.length ? parts.join(' / ') : null;
}
