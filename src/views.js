export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const page = (title, body) => `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root{--red:#b3262e;--green:#1f6f4a;--bg:#fbf7f0;--ink:#2a2323}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.5 system-ui,sans-serif}
  main{max-width:640px;margin:0 auto;padding:24px 16px 64px}
  h1{color:var(--red);margin:.2em 0}
  .card{background:#fff;border-radius:12px;padding:16px 18px;margin:16px 0;box-shadow:0 1px 4px #0002}
  label{display:block;font-weight:600;margin:12px 0 4px}
  input,textarea{width:100%;padding:10px;border:1px solid #c9bfb0;border-radius:8px;font:inherit}
  textarea{min-height:120px}
  button{background:var(--green);color:#fff;border:0;border-radius:8px;padding:12px 18px;font:inherit;font-weight:600;margin-top:14px;cursor:pointer}
  button.danger{background:var(--red)} button.link{background:none;color:var(--red);padding:0;margin:0;text-decoration:underline}
  .ok{color:var(--green)} .muted{color:#7a6f6f} .msg{background:#e7f4ec;padding:10px 14px;border-radius:8px}
  .gift{white-space:pre-wrap;background:#fff7e0;border-left:4px solid #e0a800;padding:10px 14px;border-radius:6px}
  ul{padding-left:0;list-style:none} li{display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid #eee}
</style></head><body><main>${body}</main></body></html>`;
