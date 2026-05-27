// CORS headers for the embeddable render fragment. The Shadow-DOM loader script
// runs on the customer's own domain and fetches the fragment cross-origin; the
// payload is public, read-only render output (same as the standalone /render
// page), so a wildcard origin is safe.
export const FRAGMENT_CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
}
