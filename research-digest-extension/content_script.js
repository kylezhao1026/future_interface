(() => {
  if (globalThis.__newsDigestMessageHandler) {
    chrome.runtime.onMessage.removeListener(globalThis.__newsDigestMessageHandler);
  }
  const messageHandler = (msg) => {
    if (msg.action === "open_overlay") openOverlay();
  };
  chrome.runtime.onMessage.addListener(messageHandler);
  globalThis.__newsDigestMessageHandler = messageHandler;

  const A11Y_KEYS = ["focus", "bold", "dyslexia", "largeText", "lineSpacing", "reducedMotion", "highContrast"];
  const A11Y_DEFAULTS = Object.fromEntries(A11Y_KEYS.map((k) => [k, false]));
  const hasExtensionContext = () => {
    try {
      return Boolean(chrome?.runtime?.id);
    } catch {
      return false;
    }
  };

  function extractArticle() {
    const clone = document.cloneNode(true);
    const reader = new Readability(clone);
    const parsed = reader.parse() || {};
    const title = parsed.title || document.querySelector('meta[property="og:title"]')?.content || document.title;
    const byline = parsed.byline || document.querySelector('meta[name="author"]')?.content || "";
    const siteName = parsed.siteName || document.querySelector('meta[property="og:site_name"]')?.content || location.hostname.replace(/^www\./, "");
    const publishedTime = parsed.publishedTime || document.querySelector('meta[property="article:published_time"]')?.content || document.querySelector('meta[name="pubdate"]')?.content || document.querySelector("time[datetime]")?.getAttribute("datetime") || "";
    const textContent = parsed.textContent || document.body.innerText;
    const contentHtml = parsed.content || "";
    let date = "";
    if (publishedTime) {
      try { date = new Date(publishedTime).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }); }
      catch { date = publishedTime; }
    }
    return { title, byline, siteName, date, textContent, contentHtml };
  }

  function sanitizeHtml(html) {
    const div = document.createElement("div");
    div.innerHTML = html;
    div.querySelectorAll("script,iframe,object,embed,form,input,style").forEach((el) => el.remove());
    div.querySelectorAll("*").forEach((el) => {
      for (const attr of [...el.attributes]) {
        if (attr.name.startsWith("on") || attr.name === "style") el.removeAttribute(attr.name);
      }
    });
    return div.innerHTML;
  }

  function openOverlay() {
    const existing = document.getElementById("news-digest-host");
    if (existing) { existing.remove(); document.body.style.overflow = ""; return; }

    const article = extractArticle();
    const host = document.createElement("div");
    host.id = "news-digest-host";
    host.style.cssText = "position:fixed;inset:0;z-index:2147483647;";
    const shadow = host.attachShadow({ mode: "closed" });
    document.body.appendChild(host);
    document.body.style.overflow = "hidden";

    const close = () => { host.remove(); document.body.style.overflow = ""; };
    document.addEventListener("keydown", function escHandler(e) {
      if (e.key === "Escape") { close(); document.removeEventListener("keydown", escHandler); }
    });

    shadow.innerHTML = `<style>${OVERLAY_CSS}</style>
<div class="overlay overlay-enter" id="overlay">
  <div class="toolbar">
    <div class="toolbar-left">
      <button class="tb-btn" id="copy-btn" title="Copy Markdown">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        <span>Copy</span>
      </button>
      <button class="tb-btn toggle-btn" id="toggle-btn">Show article</button>
    </div>
    <button class="tb-close" id="close-btn">&times;</button>
  </div>
  <div class="content" id="content">
    <div class="col">
      <div class="meta-line" id="meta-line"></div>
      <h1 class="headline" id="headline"></h1>
      <div id="digest-area">
        <div class="loading"><div class="spinner"></div><span>Analyzing article…</span></div>
      </div>
      <div id="article-area" class="article-area hidden"></div>
    </div>
  </div>
  ${buildRailHTML()}
</div>`;

    const overlay = shadow.getElementById("overlay");
    const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (prefersReducedMotion) {
      overlay.classList.remove("overlay-enter");
      overlay.classList.add("overlay-visible");
    } else {
      // Force the initial "enter" state to paint before transitioning out of it.
      overlay.getBoundingClientRect();
      requestAnimationFrame(() => {
        setTimeout(() => {
          overlay.classList.remove("overlay-enter");
          overlay.classList.add("overlay-visible");
        }, 35);
      });
    }

    const $ = (sel) => shadow.querySelector(sel);
    const headline = $("#headline");
    const metaLine = $("#meta-line");
    const digestArea = $("#digest-area");
    const articleArea = $("#article-area");
    const toggleBtn = $("#toggle-btn");
    const copyBtn = $("#copy-btn");

    headline.textContent = article.title;
    metaLine.textContent = [article.siteName, article.byline, article.date].filter(Boolean).join(" · ");
    articleArea.innerHTML = sanitizeHtml(article.contentHtml);

    let showingArticle = false;
    toggleBtn.onclick = () => {
      showingArticle = !showingArticle;
      articleArea.classList.toggle("hidden", !showingArticle);
      toggleBtn.textContent = showingArticle ? "Hide article" : "Show article";
    };

    $("#close-btn").onclick = close;

    let markdownCache = "";
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(markdownCache).then(() => {
        copyBtn.querySelector("span").textContent = "Copied!";
        setTimeout(() => (copyBtn.querySelector("span").textContent = "Copy"), 1500);
      });
    };

    // --- Accessibility rail ---
    initRail(shadow, overlay, articleArea, toggleBtn);

    // --- Summarize ---
    if (!hasExtensionContext()) {
      digestArea.innerHTML = `<div class="error">Extension reloaded. Refresh the page and try again.</div>`;
      return;
    }
    try {
      chrome.runtime.sendMessage({
        action: "summarize",
        payload: { title: article.title, site: article.siteName, date: article.date, text: article.textContent }
      }, (res) => {
        if (chrome.runtime.lastError) {
          digestArea.innerHTML = `<div class="error">${esc(chrome.runtime.lastError.message)}</div>`;
          return;
        }
        if (!res?.ok) {
          digestArea.innerHTML = `<div class="error">${esc(res?.error || "Unknown error")}</div>`;
          return;
        }
        renderDigest(res.data, digestArea);
        animateDigestReveal(overlay, digestArea);
        markdownCache = buildMarkdown(article, res.data);
      });
    } catch {
      digestArea.innerHTML = `<div class="error">Extension context invalidated. Refresh the page and try again.</div>`;
    }
  }

  // --- Rail ---

  function buildRailHTML() {
    const buttons = [
      { id: "bold", icon: "B", tip: "Bold text" },
      { id: "dyslexia", icon: "Dy", tip: "Dyslexia-friendly" },
      { id: "largeText", icon: "A+", tip: "Large text" },
      { id: "lineSpacing", icon: "☰", tip: "Line spacing" },
      { id: "reducedMotion", icon: "◇", tip: "Reduced motion" },
      { id: "highContrast", icon: "◐", tip: "High contrast" },
      { id: "reset", icon: "↺", tip: "Reset all" },
    ];
    const btns = buttons.map((b) =>
      `<button class="rail-btn" data-mode="${b.id}" title="${b.tip}"><span class="rail-icon">${b.icon}</span></button>`
    ).join("");
    return `<div class="rail" id="rail">
      <button class="rail-toggle" id="rail-toggle" title="Accessibility">⚙</button>
      <div class="rail-buttons" id="rail-buttons">${btns}</div>
    </div>`;
  }

  function initRail(shadow, overlay, articleArea, toggleBtn) {
    const rail = shadow.getElementById("rail");
    const railBtns = shadow.getElementById("rail-buttons");
    const railToggle = shadow.getElementById("rail-toggle");
    let railOpen = true;

    railToggle.onclick = () => {
      railOpen = !railOpen;
      railBtns.classList.toggle("rail-collapsed", !railOpen);
      railToggle.textContent = railOpen ? "⚙" : "⚙";
    };

    const state = { ...A11Y_DEFAULTS };

    if (hasExtensionContext()) {
      try {
        chrome.storage.sync.get({ a11y: A11Y_DEFAULTS }, (res) => {
          if (chrome.runtime.lastError || !res?.a11y) return;
          Object.assign(state, res.a11y);
          applyAll();
        });
      } catch {
        // no-op: extension context may be invalidated after reload
      }
    }

    function applyAll() {
      A11Y_KEYS.forEach((k) => overlay.classList.toggle(`mode-${k}`, !!state[k]));
      rail.querySelectorAll(".rail-btn").forEach((btn) => {
        const mode = btn.dataset.mode;
        if (mode !== "reset") btn.classList.toggle("active", !!state[mode]);
      });
    }

    function persist() {
      if (!hasExtensionContext()) return;
      try {
        chrome.storage.sync.set({ a11y: { ...state } }, () => {
          void chrome.runtime.lastError;
        });
      } catch {
        // no-op: extension context may be invalidated after reload
      }
    }

    rail.querySelectorAll(".rail-btn").forEach((btn) => {
      btn.onclick = () => {
        const mode = btn.dataset.mode;
        if (mode === "reset") {
          A11Y_KEYS.forEach((k) => (state[k] = false));
        } else {
          state[mode] = !state[mode];
        }
        applyAll();
        persist();
      };
    });
  }

  // --- Rendering ---

  function renderDigest(d, container) {
    const blocks = [
      { key: "tldr", label: "TL;DR", type: "text" },
      { key: "key_points", label: "Key Points", type: "list" },
      { key: "why_it_matters", label: "Why It Matters", type: "list" },
      { key: "what_to_watch_next", label: "What to Watch Next", type: "list" },
      { key: "quote_highlights", label: "Notable Quotes", type: "quotes" },
      { key: "bias_or_uncertainty", label: "Bias & Uncertainty", type: "list" },
    ];
    let html = '<div class="digest">';
    for (const b of blocks) {
      const val = d[b.key];
      if (!val || (Array.isArray(val) && !val.length)) continue;
      if (b.type === "text") {
        html += `<div class="tldr-block"><span class="tldr-label">${b.label}</span>${esc(val)}</div>`;
      } else if (b.type === "quotes") {
        html += `<div class="digest-section"><h3>${b.label}</h3>${val.map((q) => `<blockquote>${esc(q)}</blockquote>`).join("")}</div>`;
      } else {
        html += `<div class="digest-section"><h3>${b.label}</h3><ul>${val.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>`;
      }
    }
    html += "</div>";
    container.innerHTML = html;
  }

  function animateDigestReveal(overlay, container) {
    if (overlay.classList.contains("mode-reducedMotion")) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
    const blocks = [...container.querySelectorAll(".tldr-block, .digest-section")];
    if (!blocks.length) return;
    const canAnimate = typeof blocks[0].animate === "function";
    blocks.forEach((block, index) => {
      const delay = 120 + index * 70;
      if (!canAnimate) {
        block.classList.remove("digest-enter", "digest-enter-active");
        void block.offsetWidth;
        block.classList.add("digest-enter");
        block.style.setProperty("--digest-enter-delay", `${delay}ms`);
        requestAnimationFrame(() => {
          block.classList.add("digest-enter-active");
        });
        return;
      }
      block.getAnimations().forEach((a) => a.cancel());
      block.animate(
        [
          { opacity: 0, transform: "translateY(24px) scale(0.98)", filter: "blur(5px)" },
          { opacity: 1, transform: "translateY(0) scale(1)", filter: "blur(0)" },
        ],
        {
          duration: 760,
          delay,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          fill: "both",
        }
      );
    });
  }

  function buildMarkdown(article, d) {
    const lines = [`# ${article.title}`, ""];
    const meta = [article.siteName, article.date].filter(Boolean).join(" · ");
    if (meta) lines.push(`*${meta}*`, "");
    if (d.tldr) lines.push("## TL;DR", d.tldr, "");
    for (const [label, items] of [["Key Points", d.key_points], ["Why It Matters", d.why_it_matters], ["What to Watch Next", d.what_to_watch_next], ["Notable Quotes", d.quote_highlights], ["Bias & Uncertainty", d.bias_or_uncertainty]]) {
      if (!items?.length) continue;
      lines.push(`## ${label}`);
      for (const i of items) lines.push(label === "Notable Quotes" ? `> ${i}` : `- ${i}`);
      lines.push("");
    }
    return lines.join("\n");
  }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // --- CSS ---

  const OVERLAY_CSS = `
*, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }

/* ===== Expansion animation ===== */
.overlay {
  position:fixed; inset:0; z-index:1;
  background:#fafaf9;
  display:flex; flex-direction:column;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
  color:#1a1a1a;
  -webkit-font-smoothing: antialiased;
  transform: translateY(0) scale(1); opacity:1;
  transform-origin: center center;
  will-change: transform, opacity;
}
.overlay.overlay-enter {
  transform: translateY(52px) scale(0.94);
  opacity: 0;
}
.toolbar,
.content {
  opacity:0;
  transform:translateY(26px);
}
.col {
  opacity:0;
  transform:translateY(34px) scale(0.98);
  filter:blur(5px);
}
.rail { opacity:0; }
.overlay.overlay-visible {
  animation: overlayReveal 700ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
.overlay.overlay-visible .toolbar {
  animation: sectionReveal 560ms cubic-bezier(0.16, 1, 0.3, 1) 150ms both;
}
.overlay.overlay-visible .content {
  animation: sectionReveal 620ms cubic-bezier(0.16, 1, 0.3, 1) 240ms both;
}
.overlay.overlay-visible .col {
  animation: contentReveal 760ms cubic-bezier(0.16, 1, 0.3, 1) 320ms both;
}
.overlay.overlay-visible .rail {
  animation: railReveal 360ms ease 360ms both;
}
@keyframes overlayReveal {
  from { transform: translateY(52px) scale(0.94); opacity:0; }
  to { transform: translateY(0) scale(1); opacity:1; }
}
@keyframes sectionReveal {
  from { opacity:0; transform:translateY(26px); }
  to { opacity:1; transform:translateY(0); }
}
@keyframes contentReveal {
  from { opacity:0; transform:translateY(34px) scale(0.98); filter:blur(5px); }
  to { opacity:1; transform:translateY(0) scale(1); filter:blur(0); }
}
@keyframes railReveal {
  from { opacity:0; }
  to { opacity:1; }
}
.overlay.mode-reducedMotion,
.overlay.mode-reducedMotion.overlay-enter {
  animation:none !important;
  transform: scale(1) !important;
  opacity: 1 !important;
}
.overlay.mode-reducedMotion .toolbar,
.overlay.mode-reducedMotion .content,
.overlay.mode-reducedMotion .rail,
.overlay.mode-reducedMotion .col {
  opacity:1 !important;
  transform:none !important;
  animation:none !important;
  transition:none !important;
  filter:none !important;
}

/* ===== Toolbar (sticky) ===== */
.toolbar {
  position:sticky; top:0; z-index:10;
  display:flex; align-items:center; justify-content:space-between;
  padding:10px 28px;
  border-bottom:1px solid #e8e8e8;
  background:rgba(255,255,255,0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  flex-shrink:0;
}
.toolbar-left { display:flex; gap:8px; align-items:center; }
.tb-btn {
  display:inline-flex; align-items:center; gap:6px;
  padding:7px 16px; border-radius:8px;
  border:1px solid #d4d4d4; background:#fff;
  font-size:13px; color:#525252; cursor:pointer;
  transition: background .15s, border-color .15s;
}
.tb-btn:hover { background:#f5f5f5; border-color:#b0b0b0; }
.toggle-btn { font-weight:500; }
.tb-close {
  border:none; background:none; font-size:30px; line-height:1;
  color:#a3a3a3; cursor:pointer; padding:0 4px;
  transition: color .15s;
}
.tb-close:hover { color:#404040; }

/* ===== Scrollable content ===== */
.content {
  flex:1; overflow-y:auto; padding:56px 24px 96px;
}
.col {
  max-width:820px; margin:0 auto;
}

/* ===== Meta + headline ===== */
.meta-line {
  font-size:12px; color:#8c8c8c; margin-bottom:14px;
  letter-spacing:0.05em; text-transform:uppercase; font-weight:500;
}
.headline {
  font-size:clamp(32px, 4.5vw, 44px);
  font-weight:800; line-height:1.15;
  color:#0a0a0a; margin-bottom:40px;
  letter-spacing:-0.025em;
}

/* ===== Digest blocks ===== */
.digest {}
.digest-section {
  margin-bottom:28px;
  padding-left:16px;
  border-left:2px solid #e5e7eb;
}
.tldr-block,
.digest-section { will-change: opacity, transform, filter; }
.digest-enter {
  opacity:0;
  transform:translateY(22px) scale(0.98);
  filter:blur(5px);
}
.digest-enter.digest-enter-active {
  opacity:1;
  transform:translateY(0) scale(1);
  filter:blur(0);
  transition:opacity 560ms ease, transform 760ms cubic-bezier(0.16, 1, 0.3, 1), filter 560ms ease;
  transition-delay:var(--digest-enter-delay, 0ms);
}
.digest h3 {
  font-size:11px; font-weight:700; text-transform:uppercase;
  letter-spacing:0.1em; color:#6366f1;
  margin:0 0 10px; padding-bottom:0;
}
.digest ul {
  padding-left:18px; margin:0;
}
.digest li {
  font-size:16px; line-height:1.7; color:#374151;
  margin-bottom:7px;
}
.digest li::marker { color:#c7d2fe; }
.tldr-block {
  background:linear-gradient(135deg, #eef2ff 0%, #f0f0ff 100%);
  border-left:3px solid #6366f1;
  padding:20px 24px; border-radius:0 10px 10px 0;
  font-size:17px; line-height:1.65; color:#1e1b4b;
  margin-bottom:32px;
  box-shadow: 0 1px 3px rgba(99,102,241,0.06);
}
.tldr-label {
  display:inline-block;
  font-weight:800; font-size:10px; text-transform:uppercase;
  letter-spacing:0.1em; color:#6366f1;
  margin-right:10px;
  background:#ddd6fe; padding:2px 8px; border-radius:4px;
}
.digest blockquote {
  border-left:3px solid #a5b4fc; padding:12px 20px; margin:10px 0;
  font-style:italic; font-size:15px; line-height:1.7;
  color:#4b5563; background:#fafbff; border-radius:0 8px 8px 0;
}

/* ===== Loading + error ===== */
.loading {
  display:flex; align-items:center; gap:12px;
  padding:48px 0; color:#8c8c8c; font-size:14px;
}
.spinner {
  width:18px; height:18px; border:2px solid #e5e5e5;
  border-top-color:#6366f1; border-radius:50%;
  animation:spin .6s linear infinite;
}
@keyframes spin { to { transform:rotate(360deg); } }
.error {
  background:#fef2f2; color:#991b1b; border:1px solid #fecaca;
  padding:16px 20px; border-radius:10px; font-size:14px; line-height:1.6;
}

/* ===== Article area ===== */
.article-area {
  margin-top:48px; padding-top:36px;
  border-top:1px solid #e5e5e5;
  font-size:18px; line-height:1.8; color:#374151;
}
.article-area.hidden { display:none; }
.article-area h1,.article-area h2,.article-area h3 { margin:28px 0 10px; color:#111; line-height:1.3; }
.article-area h2 { font-size:24px; }
.article-area h3 { font-size:20px; }
.article-area p { margin-bottom:18px; }
.article-area img { max-width:100%; height:auto; border-radius:8px; margin:20px 0; }
.article-area a { color:#6366f1; text-decoration:underline; text-underline-offset:2px; }
.article-area figure { margin:24px 0; }
.article-area figcaption { font-size:13px; color:#737373; margin-top:8px; }

/* ===== Accessibility control rail ===== */
.rail {
  position:fixed; right:20px; top:50%; transform:translateY(-50%);
  display:flex; flex-direction:column; align-items:center; gap:4px;
  z-index:20;
}
.rail-toggle {
  width:36px; height:36px; border-radius:10px;
  border:1px solid rgba(0,0,0,0.08);
  background:rgba(255,255,255,0.85);
  backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px);
  box-shadow:0 2px 8px rgba(0,0,0,0.08);
  font-size:16px; cursor:pointer; color:#737373;
  display:flex; align-items:center; justify-content:center;
  transition: background .15s, color .15s;
}
.rail-toggle:hover { background:#fff; color:#525252; }
.rail-buttons {
  display:flex; flex-direction:column; gap:3px;
  background:rgba(255,255,255,0.88);
  backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px);
  border:1px solid rgba(0,0,0,0.06);
  border-radius:12px; padding:6px;
  box-shadow:0 4px 16px rgba(0,0,0,0.08);
  margin-top:4px;
  transition: opacity .2s, transform .2s;
  transform-origin: top center;
}
.rail-buttons.rail-collapsed {
  opacity:0; pointer-events:none; transform:scale(0.9) translateY(-8px);
}
.rail-btn {
  width:32px; height:32px; border-radius:8px;
  border:none; background:transparent;
  cursor:pointer; display:flex; align-items:center; justify-content:center;
  transition: background .12s, color .12s;
  position:relative;
}
.rail-btn:hover { background:rgba(0,0,0,0.05); }
.rail-btn.active { background:#eef2ff; }
.rail-icon {
  font-size:12px; font-weight:700; color:#737373;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height:1;
}
.rail-btn.active .rail-icon { color:#6366f1; }
.rail-btn::after {
  content:attr(title); position:absolute;
  right:calc(100% + 8px); top:50%; transform:translateY(-50%);
  background:#1a1a1a; color:#fff; font-size:11px; font-weight:500;
  padding:4px 10px; border-radius:6px; white-space:nowrap;
  opacity:0; pointer-events:none;
  transition:opacity .15s;
}
.rail-btn:hover::after { opacity:1; }

/* ===== Accessibility modes ===== */
.mode-bold .digest li,
.mode-bold .tldr-block,
.mode-bold .article-area,
.mode-bold .article-area p { font-weight:600; }

.mode-dyslexia {
  font-family: OpenDyslexic, "Comic Sans MS", "Trebuchet MS", Verdana, sans-serif !important;
  letter-spacing:0.04em; word-spacing:0.12em;
}
.mode-dyslexia .headline,
.mode-dyslexia .digest li,
.mode-dyslexia .tldr-block,
.mode-dyslexia .article-area { font-family:inherit !important; }

.mode-largeText .digest li { font-size:18px; }
.mode-largeText .tldr-block { font-size:19px; }
.mode-largeText .article-area { font-size:20px; }
.mode-largeText .headline { font-size:clamp(36px, 5vw, 52px); }
.mode-largeText .digest blockquote { font-size:17px; }

.mode-lineSpacing .digest li,
.mode-lineSpacing .tldr-block,
.mode-lineSpacing .article-area,
.mode-lineSpacing .article-area p { line-height:2.0; }

.mode-reducedMotion *,
.mode-reducedMotion *::before,
.mode-reducedMotion *::after {
  animation-duration:0s !important;
  transition-duration:0s !important;
}
.mode-reducedMotion .digest-enter,
.mode-reducedMotion .digest-enter.digest-enter-active {
  opacity:1 !important;
  transform:none !important;
  filter:none !important;
}

.mode-highContrast {
  background:#111 !important; color:#f5f5f5 !important;
}
.mode-highContrast .toolbar {
  background:rgba(20,20,20,0.95) !important;
  border-color:#333 !important;
}
.mode-highContrast .tb-btn {
  background:#222 !important; color:#e5e5e5 !important;
  border-color:#444 !important;
}
.mode-highContrast .tb-close { color:#999 !important; }
.mode-highContrast .headline { color:#fff !important; }
.mode-highContrast .meta-line { color:#999 !important; }
.mode-highContrast .digest li { color:#ddd !important; }
.mode-highContrast .digest h3 { color:#a5b4fc !important; border-color:#333 !important; }
.mode-highContrast .digest-section { border-color:#333 !important; }
.mode-highContrast .tldr-block {
  background:#1a1a2e !important; color:#e0e0ff !important;
  border-color:#6366f1 !important; box-shadow:none !important;
}
.mode-highContrast .tldr-label { background:#4338ca !important; color:#e0e0ff !important; }
.mode-highContrast .digest blockquote {
  background:#1a1a1a !important; color:#ccc !important;
  border-color:#6366f1 !important;
}
.mode-highContrast .article-area { color:#ddd !important; border-color:#333 !important; }
.mode-highContrast .article-area h1,
.mode-highContrast .article-area h2,
.mode-highContrast .article-area h3 { color:#f5f5f5 !important; }
.mode-highContrast .article-area a { color:#a5b4fc !important; }
.mode-highContrast .error {
  background:#2a1515 !important; color:#fca5a5 !important; border-color:#7f1d1d !important;
}
.mode-highContrast .rail-buttons {
  background:rgba(30,30,30,0.95) !important; border-color:#333 !important;
}
.mode-highContrast .rail-toggle {
  background:rgba(30,30,30,0.9) !important; color:#aaa !important; border-color:#333 !important;
}
.mode-highContrast .rail-btn:hover { background:rgba(255,255,255,0.08) !important; }
.mode-highContrast .rail-btn.active { background:#1e1b4b !important; }
.mode-highContrast .rail-icon { color:#999 !important; }
.mode-highContrast .rail-btn.active .rail-icon { color:#a5b4fc !important; }
.mode-highContrast .loading { color:#888 !important; }

/* ===== Responsive ===== */
@media (max-width:640px) {
  .content { padding:32px 16px 64px; }
  .toolbar { padding:8px 14px; }
  .rail { right:10px; }
  .rail-btn::after { display:none; }
}
`;
})();
