/* TrEDBoxle: the TrEDBox sign-in, shared with the rest of the site.
 * Same keys as assets/app.js and assets/common.js, so signing in here also opens the database,
 * and signing in on the hub also unlocks the archive and free play:
 *   sessionStorage "entdb-access"          preview user + password (this browser tab only)
 *   localStorage   "entdb-admin-session"   curator session (email + password)
 * Access is checked with public.check_access(), exactly like the hub. Today's puzzle never needs it. */
(function () {
  const CFG = window.ENT_CONFIG || {};
  const base = String(CFG.supabaseUrl || "").replace(/\/+$/, ""), anon = CFG.supabaseAnonKey || "";
  const ACCESS_KEY = "entdb-access", SESSION_KEY = "entdb-admin-session";
  const listeners = [];
  let user = null;   // { kind: "preview" | "curator", name }

  const readAccess = () => { try { return JSON.parse(sessionStorage.getItem(ACCESS_KEY) || "null"); } catch (e) { return null; } };
  const saveAccess = a => { try { a ? sessionStorage.setItem(ACCESS_KEY, JSON.stringify(a)) : sessionStorage.removeItem(ACCESS_KEY); } catch (e) {} };
  const readSession = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch (e) { return null; } };
  const saveSession = s => { try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch (e) {} };

  function headers(token) {
    const h = { apikey: anon, "Content-Type": "application/json" };
    if (token) h.Authorization = "Bearer " + token;   // new "sb_..." keys are not JWTs: never sent as Bearer
    return h;
  }
  async function checkAccess(a, token) {
    const res = await fetch(base + "/rest/v1/rpc/check_access", { method: "POST", headers: headers(token),
      body: JSON.stringify({ p_user: (a && a.user) || "", p_pass: (a && a.pass) || "" }) });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return (await res.json()) === true;
  }
  function emailOf(s) {
    if (s.email) return s.email;
    try { return JSON.parse(atob(s.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).email || "Curator"; } catch (e) { return "Curator"; }
  }
  function set(u) { const was = JSON.stringify(user); user = u; if (JSON.stringify(u) !== was) listeners.forEach(f => f(u)); }

  const A = {
    get enabled() { return !!(base && anon); },
    get user() { return user; },
    get name() { return user ? user.name : ""; },
    onChange(cb) { listeners.push(cb); },

    async init() {
      if (!A.enabled) return;
      const s = readSession();
      if (s && s.access_token && (!s.expires_at || s.expires_at > Date.now())) {
        try { if (await checkAccess(null, s.access_token)) { user = { kind: "curator", name: emailOf(s) }; return; } } catch (e) {}
      }
      const a = readAccess();
      if (a && a.user) {
        try { if (await checkAccess(a)) user = { kind: "preview", name: a.user }; else saveAccess(null); }
        catch (e) { user = { kind: "preview", name: a.user }; }   // offline: trust the login saved in this tab
      }
    },

    // a curator signs in with an email, everyone else with the shared preview user name
    async signIn(u, p) {
      if (/^\S+@\S+\.\S+$/.test(u)) {
        const res = await fetch(base + "/auth/v1/token?grant_type=password", { method: "POST", headers: headers(), body: JSON.stringify({ email: u, password: p }) });
        if (res.ok) {
          const r = await res.json();
          const s = { access_token: r.access_token, refresh_token: r.refresh_token, expires_at: Date.now() + (r.expires_in || 3600) * 1000, email: (r.user && r.user.email) || u };
          if (await checkAccess(null, s.access_token)) { saveSession(s); set({ kind: "curator", name: s.email }); return; }
        } else if (res.status === 429) throw new Error("Too many attempts. Wait a few minutes and try again.");
      }
      const a = { user: u, pass: p };
      if (!(await checkAccess(a))) throw new Error("Wrong user name or password.");
      saveAccess(a); set({ kind: "preview", name: u });
    },
    signOut() { saveAccess(null); if (user && user.kind === "curator") saveSession(null); set(null); }
  };
  window.TREDBOXLE_ACCESS = A;
})();
