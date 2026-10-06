// iOS Hex Fix 1.1.0: hex polyfill + diagnostics for Self-hosted LiveSync.
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
const { Plugin, Notice } = require("obsidian");
const errors = [];
const keep = (k, e) => errors.push(k + ": " + (e && (e.stack || e.message) || String(e)).slice(0, 600));
window.addEventListener("error", e => keep("error", e.error || e.message));
window.addEventListener("unhandledrejection", e => keep("rejection", e.reason));
const wait = ms => new Promise(r => setTimeout(r, ms));
async function step(name, fn) { try { return name + ": OK " + (await fn() ?? ""); } catch (e) { return name + ": FAIL " + (e && e.message); } }
async function diagnose(app, plugin) {
  const out = ["# iOS hexfix diagnostic", new Date().toISOString(), navigator.userAgent, ""];
  out.push("native fromHex(before polyfill unknown) now: " + typeof Uint8Array.fromHex + ", toHex: " + typeof Uint8Array.prototype.toHex);
  out.push("fromBase64: " + typeof Uint8Array.fromBase64 + ", toBase64: " + typeof Uint8Array.prototype.toBase64);
  out.push("crypto.subtle: " + typeof (crypto && crypto.subtle));
  const ls = app.plugins.plugins["obsidian-livesync"];
  out.push("livesync loaded: " + !!ls + ", version: " + (ls && ls.manifest && ls.manifest.version));
  out.push(await step("hex roundtrip", () => Uint8Array.fromHex("00ff10").toHex()));
  out.push(await step("PBKDF2 310000", async () => { const k = await crypto.subtle.importKey("raw", new TextEncoder().encode("x"), "PBKDF2", false, ["deriveKey"]); await crypto.subtle.deriveKey({ name: "PBKDF2", salt: new Uint8Array(32), iterations: 310000, hash: "SHA-256" }, k, { name: "AES-GCM", length: 256 }, true, ["encrypt"]); }));
  out.push(await step("HKDF+AES-GCM", async () => { const base = await crypto.subtle.importKey("raw", new Uint8Array(32), "HKDF", false, ["deriveKey"]); const k = await crypto.subtle.deriveKey({ name: "HKDF", salt: new Uint8Array(32), info: new Uint8Array(), hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]); const iv = new Uint8Array(12); const c = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, new Uint8Array([1, 2, 3])); await crypto.subtle.decrypt({ name: "AES-GCM", iv }, k, c); }));
  out.push("", "## captured errors", ...(errors.length ? errors : ["none"]));
  try {
    app.commands.executeCommandById("obsidian-livesync:view-log"); await wait(2500);
    const el = document.querySelector('.workspace-leaf-content[data-type="log-log"]');
    let t = el ? el.textContent : "log view not found";
    t = t.replace(/\/\/[^\/\s:@]+:[^@\s]+@/g, "//REDACTED@").slice(-5000);
    out.push("", "## livesync log (tail)", t);
  } catch (e) { out.push("log capture failed: " + e.message); }
  const path = "hexfix-diagnostic.md";
  const body = out.join("\n");
  const f = app.vault.getAbstractFileByPath(path);
  if (f) await app.vault.modify(f, body); else await app.vault.create(path, body);
  new Notice("Hexfix diagnostic written to hexfix-diagnostic.md");
}
module.exports = class extends Plugin {
  onload() {
    this.addCommand({ id: "diagnose", name: "Hexfix: write diagnostic note", callback: () => diagnose(this.app, this) });
    this.app.workspace.onLayoutReady(() => new Notice("iOS Hex Fix active (hex: " + typeof Uint8Array.fromHex + "/" + typeof Uint8Array.prototype.toHex + ")", 8000));
  }
};
