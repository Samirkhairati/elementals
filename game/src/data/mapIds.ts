/**
 * The editor stores a warp's map as the editor file name (`new_map_1`), while the game's maps are named after
 * the exported file (`new map 1` from the Export button, `new-map-1` from `npm run maps:export`). The same
 * slug rule as `scripts/lib/maps.mjs` makes those spellings find each other.
 */
export function slugMapId(id: string): string {
  return id
    .replace(/\.json$/i, "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The game map key for `id`: an exact key wins, otherwise the one with the same slug. Undefined when none or ambiguous. */
export function resolveMapKey(keys: readonly string[], id: string): string | undefined {
  if (keys.includes(id)) return id;
  const slug = slugMapId(id);
  if (!slug) return undefined;
  const matches = keys.filter((k) => slugMapId(k) === slug);
  return matches.length === 1 ? matches[0] : undefined;
}
