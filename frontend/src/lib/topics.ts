/**
 * The fixed list of topic tags Anna uses across content. Anything outside
 * this list is either legacy (kept for backward compat in display only)
 * or technical YAML metadata that should be filtered from the UI.
 *
 * Order matters - this is the order they appear in the picker dropdown.
 */
export const ALLOWED_TOPICS = [
  'positioning',
  'YouTube',
  'personal brand',
  'online business',
  'offer launching',
  'mindset',
  'content strategy',
  'digital products',
] as const;

export type Topic = (typeof ALLOWED_TOPICS)[number];

/**
 * Tags that should be hidden from the UI entirely. These are technical
 * YAML metadata baked into POV file frontmatter and bank-entry schemas.
 * They give no useful topic signal to Anna ("type/asset" doesn't tell her
 * what the entry is *about*).
 *
 * Filter rule: any tag containing "/" is treated as namespaced metadata and
 * dropped. This catches type/asset, domain/povs, source/transcript, etc.
 * If we ever need a new namespaced topic, this needs revisiting.
 */
export function isDisplayableTopic(tag: string): boolean {
  if (!tag) return false;
  if (tag.includes('/')) return false;
  return true;
}

/**
 * Clean a tag array for display: drop slash-namespaced ones, dedupe.
 */
export function cleanTopics(tags: string[] | null | undefined): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    if (!isDisplayableTopic(t)) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}
