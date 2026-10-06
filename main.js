// Polyfill for iOS WebKit that exposes Uint8Array base64 APIs but lacks hex APIs.
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

const {Plugin}=require("obsidian");
module.exports=class extends Plugin{onload(){}};
