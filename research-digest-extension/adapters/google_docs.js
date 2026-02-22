var GoogleDocsAdapter = {
  canHandle() {
    return location.hostname === "docs.google.com" && location.pathname.startsWith("/document/");
  },

  async extract() {
    const title =
      document.querySelector(".docs-title-input")?.value ||
      document.title.replace(/ - Google Docs$/, "").trim();

    let text = "";
    let html = null;

    // Strategy 1: kix paragraph renderers (classic editor)
    const paragraphs = document.querySelectorAll(".kix-paragraphrenderer");
    if (paragraphs.length > 0) {
      const parts = [];
      const htmlParts = [];
      for (const p of paragraphs) {
        const line = p.innerText.trim();
        if (!line) continue;
        parts.push(line);
        const headingEl = p.closest('[class*="heading"]');
        const isHeading = headingEl || p.querySelector('[style*="font-size: 2"], [style*="font-weight: 700"]');
        htmlParts.push(isHeading ? `<h2>${_gdEsc(line)}</h2>` : `<p>${_gdEsc(line)}</p>`);
      }
      text = parts.join("\n\n");
      html = htmlParts.join("\n");
    }

    // Strategy 2: contenteditable region
    if (text.length < 50) {
      const editable = document.querySelector('[contenteditable="true"]');
      if (editable) {
        text = editable.innerText.trim();
        html = null;
      }
    }

    // Strategy 3: editor container
    if (text.length < 50) {
      const editor = document.querySelector(".kix-appview-editor, #docs-editor-container, .docs-editor");
      if (editor) {
        text = editor.innerText.trim();
        html = null;
      }
    }

    // Strategy 4: aria document content
    if (text.length < 50) {
      const aria = document.querySelector('[aria-label="Document content"], [role="textbox"]');
      if (aria) {
        text = aria.innerText.trim();
        html = null;
      }
    }

    if (text.length < 20) {
      throw new Error(
        "Could not extract text from this Google Doc. It may use canvas-based rendering. " +
        "Try File → Download → Plain Text (.txt) and open that file instead."
      );
    }

    // Smart truncation for very long docs
    if (text.length > 120000) {
      const first = text.slice(0, 36000);
      const mid = text.slice(Math.floor(text.length * 0.4), Math.floor(text.length * 0.4) + 20000);
      const last = text.slice(-20000);
      text = first + "\n\n[... middle section sampled ...]\n\n" + mid + "\n\n[... end section ...]\n\n" + last;
    }

    return {
      kind: "gdoc", url: location.href, title, source: "Google Docs",
      author: null, date: null,
      text, html, meta: null
    };
  }
};

function _gdEsc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
