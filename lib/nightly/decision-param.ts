// The `d` parameter of /events written: base64url of the JSON list of decisions, UTF-8 (a comment may
// be in any language). Kept apart from decisions.ts so the page's client code takes no zod with it;
// parseDecisions reads it back.
import type { Decision } from "./decisions";

export function encodeDecisions(decisions: readonly Decision[]): string {
  const bytes = new TextEncoder().encode(JSON.stringify(decisions));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
