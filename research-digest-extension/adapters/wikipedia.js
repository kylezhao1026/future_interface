var WikipediaAdapter = {
  canHandle() {
    return location.hostname.endsWith(".wikipedia.org") && location.pathname.startsWith("/wiki/");
  },

  async extract() {
    const title = document.getElementById("firstHeading")?.textContent?.trim() || document.title;
    const root = document.querySelector("#mw-content-text .mw-parser-output");
    if (!root) throw new Error("Could not find Wikipedia article content.");

    const clone = root.cloneNode(true);
    clone.querySelectorAll([
      ".toc", ".infobox", ".navbox", ".navbox-styles", ".reflist", ".reference",
      ".sidebar", ".mw-editsection", ".mw-jump-link", ".sistersitebox", ".hatnote",
      ".metadata", ".noprint", ".mw-empty-elt", ".vertical-navbox",
      ".mbox-small", ".ambox", ".ombox", ".tmbox", ".fmbox", ".cmbox", ".dmbox",
      ".imbox", "#coordinates", ".portal", "style", "link", "sup.reference"
    ].join(",")).forEach((el) => el.remove());

    const text = clone.textContent.replace(/\[\d+\]/g, "").replace(/\n{3,}/g, "\n\n").trim();

    return {
      kind: "wikipedia", url: location.href, title, source: "Wikipedia",
      author: null, date: null,
      text: text.slice(0, 80000),
      html: clone.innerHTML, meta: null
    };
  }
};
