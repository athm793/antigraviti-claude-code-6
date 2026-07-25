/**
 * Slug helpers, kept free of any database import so the create form can use
 * the exact same rules the server enforces. Importing them from endpointsDb
 * would drag the Neon driver into the client bundle.
 */

/** Slug rules are strict — it becomes part of a public URL. */
export function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length >= 2 && slug.length <= 60;
}
