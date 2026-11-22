/* TrEDBoxle configuration (the TrEDBox daily puzzle, docs/game/).
 * Data: verified (curator-approved) values are read from public.game_molecules() in supabase/schema.sql,
 *   the only part of the database open without sign-in. Endpoint and key come from ../assets/config.js.
 *   Until that function exists, the built-in sample in data.js is used.
 * Access: everything is open to everyone, with no sign-in. To put sections behind the TrEDBox sign-in
 *   again (same login as the database), list them in loginRequiredFor, e.g. ["archive", "free", "theory"]. */
window.TREDBOXLE_CONFIG = {
  launchDate: "2026-11-01",          // puzzle #1; the archive starts here
  feedUrl: (window.ENT_CONFIG || {}).supabaseUrl,
  feedKey: (window.ENT_CONFIG || {}).supabaseAnonKey,
  loginRequiredFor: [],              // nothing needs sign-in
  seedCreatedAt: "2026-01-01",       // sample entries count as present from this date
  dailyMaxTries: 5,
  // daily formats, rotated day by day (puzzle #1 uses the first)
  dailyRotation: ["guess-et", "pick", "guess-pot", "rank", "guess-et", "ladder", "pick-cannot"]
};

/* apply the saved theme before the page paints (kept here: the page's CSP allows no inline script) */
try { const t = JSON.parse(localStorage.getItem("tredboxle:theme") || '"auto"'); if (t !== "auto") document.documentElement.setAttribute("data-theme", t); } catch (e) {}
