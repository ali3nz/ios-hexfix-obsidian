// iOS Hex Fix 1.2.0: hex polyfill + Second Brain LiveSync settings repair.
if (typeof Uint8Array.fromHex !== "function") {
  Object.defineProperty(Uint8Array, "fromHex", { configurable: true, writable: true, value(s) {
    if (typeof s !== "string" || s.length % 2) throw new SyntaxError("Invalid hex string");
    const o = new Uint8Array(s.length / 2);
    for (let i = 0; i < o.length; i++) { const b = parseInt(s.substr(i * 2, 2), 16); if (Number.isNaN(b)) throw new SyntaxError("Invalid hex string"); o[i] = b; }
    return o; } });
}
if (typeof Uint8Array.prototype.toHex !== "function") {
  Object.defineProperty(Uint8Array.prototype, "toHex", { configurable: true, writable: true, value() {
    let r = ""; for (let i = 0; i < this.length; i++) r += this[i].toString(16).padStart(2, "0"); return r; } });
}
const { Plugin, Notice, requestUrl } = require("obsidian");
const EXPECTED = "67d932fd28980fad57beedd7848104f0734830aea3dad70b91fec3dd6876d50b";
const DBNAME = "second-brain";
const DEFAULT_URI = "https://notes.risingflow.com";
const sha = async t => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t || "")))].map(b => b.toString(16).padStart(2, "0")).join("");
async function note(app, lines) {
  const path = "hexfix-diagnostic.md", body = lines.join("\n");
  const f = app.vault.getAbstractFileByPath(path);
  if (f) await app.vault.modify(f, body); else await app.vault.create(path, body);
}
async function repair(app, manual) {
  const out = ["# Second Brain LiveSync repair", new Date().toISOString(), ""];
  const ls = app.plugins.plugins["obsidian-livesync"];
  if (!ls || !ls.core) { if (manual) new Notice("Self-hosted LiveSync is not loaded in this vault."); return; }
  const st = ls.core._services && ls.core._services._setting;
  const s = st && st.settings;
  if (!s) { if (manual) new Notice("Could not read LiveSync settings."); return; }
  if (s.couchDB_DBNAME !== DBNAME) { if (manual) new Notice("This vault is not connected to " + DBNAME + " (it uses '" + s.couchDB_DBNAME + "'). Nothing changed."); return; }
  const passOk = (await sha(s.passphrase)) === EXPECTED;
  out.push("passphrase matches server: " + passOk + " (length " + (s.passphrase || "").length + ")");
  out.push("idDerivationVersion: " + s.idDerivationVersion + ", ID key saved: " + !!s.idDerivationKey);
  out.push("encrypt: " + s.encrypt + ", E2EE: " + s.E2EEAlgorithm + ", path obfuscation: " + s.usePathObfuscation + ", isConfigured: " + s.isConfigured);
  const healthy = passOk && !s.idDerivationVersion && !s.idDerivationKey && s.encrypt && s.usePathObfuscation && s.E2EEAlgorithm === "v2" && s.isConfigured;
  if (healthy) { out.push("", "Settings already correct. Nothing changed."); await note(app, out); if (manual) new Notice("Second Brain settings already correct."); return; }
  try {
    const base = (s.couchDB_URI || DEFAULT_URI).replace(/\/+$/, "");
    const r = await requestUrl({ url: base + "/" + DBNAME + "/_local/phone-setup", headers: { Authorization: "Basic " + btoa(s.couchDB_USER + ":" + s.couchDB_PASSWORD) }, throw: false });
    if (r.status !== 200) throw new Error("server returned HTTP " + r.status);
    const pass = r.json.passphrase;
    if ((await sha(pass)) !== EXPECTED) throw new Error("server passphrase check failed");
    await st.applyExternalSettings({ passphrase: pass, encrypt: true, E2EEAlgorithm: "v2", usePathObfuscation: true, encryptInternalMetadata: false, idDerivationVersion: 0, idDerivationKey: "", encryptedIdDerivationKey: "", isConfigured: true }, true);
    const n = st.settings;
    out.push("", "REPAIRED. Now: passphrase matches: " + ((await sha(n.passphrase)) === EXPECTED) + ", idDerivationVersion: " + n.idDerivationVersion + ", ID key saved: " + !!n.idDerivationKey + ", isConfigured: " + n.isConfigured);
    await note(app, out);
    new Notice("Second Brain LiveSync settings repaired. Fully close Obsidian (swipe it away) and reopen it.", 0);
  } catch (e) {
    out.push("", "REPAIR FAILED: " + (e && e.message));
    await note(app, out);
    new Notice("Second Brain repair failed: " + (e && e.message) + ". See hexfix-diagnostic.md", 0);
  }
}
module.exports = class extends Plugin {
  onload() {
    this.addCommand({ id: "repair", name: "Hexfix: repair Second Brain LiveSync settings", callback: () => repair(this.app, true) });
    this.app.workspace.onLayoutReady(() => setTimeout(() => repair(this.app, false).catch(e => new Notice("Hexfix error: " + e.message, 0)), 4000));
  }
};
