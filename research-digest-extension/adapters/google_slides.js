var GoogleSlidesAdapter = {
  canHandle() {
    return location.hostname === "docs.google.com" && location.pathname.startsWith("/presentation/");
  },

  async extract() {
    const title = document.title.replace(/ - Google Slides$/, "").trim();
    const slideTexts = [];

    // Strategy 1: SVG-based slides in editor/viewer
    const svgPages = document.querySelectorAll(
      ".punch-viewer-svgpage-svgcontainer, .punch-viewer-svgpage"
    );
    if (svgPages.length > 0) {
      for (let i = 0; i < svgPages.length; i++) {
        const texts = svgPages[i].querySelectorAll("text, tspan");
        const seen = new Set();
        const parts = [];
        for (const el of texts) {
          const t = el.textContent.trim();
          if (t && !seen.has(t)) { seen.add(t); parts.push(t); }
        }
        if (parts.length) slideTexts.push(`Slide ${i + 1}:\n${parts.join("\n")}`);
      }
    }

    // Strategy 2: filmstrip thumbnails
    if (slideTexts.length === 0) {
      const thumbs = document.querySelectorAll(
        ".punch-filmstrip-thumbnail, [id^='filmstrip-'] .punch-viewer-svgpage-svgcontainer"
      );
      for (let i = 0; i < thumbs.length; i++) {
        const texts = thumbs[i].querySelectorAll("text, tspan");
        const parts = [...new Set([...texts].map((t) => t.textContent.trim()).filter(Boolean))];
        if (parts.length) slideTexts.push(`Slide ${i + 1}:\n${parts.join("\n")}`);
      }
    }

    // Strategy 3: generic text containers in slide area
    if (slideTexts.length === 0) {
      const containers = document.querySelectorAll(
        ".sketchy-text-content-text, [class*='slide'] [class*='text'], .punch-viewer-content [role='listitem']"
      );
      for (let i = 0; i < containers.length; i++) {
        const t = containers[i].innerText.trim();
        if (t) slideTexts.push(`Slide ${i + 1}:\n${t}`);
      }
    }

    // Speaker notes (bonus)
    const notes = document.querySelectorAll(
      ".punch-viewer-speakernotes-text, .punch-viewer-speakernotes-text-root"
    );
    let speakerNotes = "";
    if (notes.length > 0) {
      const noteParts = [...notes].map((n) => n.innerText.trim()).filter(Boolean);
      if (noteParts.length) speakerNotes = "\n\n--- Speaker Notes ---\n" + noteParts.join("\n\n");
    }

    if (slideTexts.length === 0) {
      throw new Error(
        "Could not extract slide text. The presentation may be empty or use an unsupported rendering mode."
      );
    }

    const text = slideTexts.join("\n\n") + speakerNotes;

    return {
      kind: "gslides", url: location.href, title, source: "Google Slides",
      author: null, date: null,
      text: text.slice(0, 120000), html: null,
      meta: { slideCount: slideTexts.length }
    };
  }
};
