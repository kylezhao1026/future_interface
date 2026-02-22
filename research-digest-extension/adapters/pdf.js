var PdfAdapter = {
  canHandle() {
    if (/\.pdf(\?|#|$)/i.test(location.pathname)) return true;
    if (location.hostname === "drive.google.com" && location.pathname.startsWith("/file/d/")) return true;
    if (document.contentType === "application/pdf") return true;
    if (document.querySelector('embed[type="application/pdf"]')) return true;
    return false;
  },

  async extract(onProgress) {
    if (typeof pdfjsLib === "undefined") {
      throw new Error("PDF parser not available. Try clicking the extension icon again.");
    }

    let pdfUrl = location.href;
    let isGDrive = false;

    // Google Drive: construct download URL
    if (location.hostname === "drive.google.com") {
      const fileId = location.pathname.match(/\/file\/d\/([^/]+)/)?.[1];
      if (!fileId) throw new Error("Could not extract Google Drive file ID.");
      pdfUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
      isGDrive = true;
    }

    // Fetch PDF bytes
    onProgress?.("Downloading PDF…");
    let arrayBuffer;
    try {
      const res = await fetch(pdfUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      arrayBuffer = await res.arrayBuffer();
    } catch (err) {
      if (isGDrive) {
        throw new Error(
          "Could not download this Google Drive PDF. Make sure the file is shared " +
          '("Anyone with the link") or open the direct PDF URL instead.'
        );
      }
      throw new Error(`Failed to download PDF: ${err.message}`);
    }

    // Set up PDF.js worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("lib/pdfjs/pdf.worker.min.js");

    onProgress?.("Opening PDF…");
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages = pdf.numPages;
    const maxPages = Math.min(totalPages, 15);

    const pages = [];
    for (let i = 1; i <= maxPages; i++) {
      onProgress?.(`Parsing page ${i} of ${maxPages}…`);
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      const lines = [];
      let lastY = null;
      for (const item of tc.items) {
        if (lastY !== null && Math.abs(item.transform[5] - lastY) > 2) lines.push("\n");
        lines.push(item.str);
        lastY = item.transform[5];
      }
      pages.push(lines.join(""));
      // Yield to event loop periodically
      if (i % 3 === 0) await new Promise((r) => setTimeout(r, 0));
    }

    // Title: try PDF metadata, then filename
    let pdfTitle = "";
    try {
      const meta = await pdf.getMetadata();
      pdfTitle = meta?.info?.Title || "";
    } catch {}
    if (!pdfTitle) {
      pdfTitle = decodeURIComponent(
        location.pathname.split("/").pop()?.replace(/\.pdf$/i, "") || ""
      ).replace(/[_-]+/g, " ").trim();
    }
    if (!pdfTitle) pdfTitle = document.title || "PDF Document";

    const text = pages.map((p, i) => `--- Page ${i + 1} ---\n${p}`).join("\n\n");
    const truncNote = totalPages > maxPages
      ? `\n\n[Note: Only first ${maxPages} of ${totalPages} pages were extracted.]`
      : "";

    return {
      kind: "pdf", url: location.href,
      title: pdfTitle, source: "PDF",
      author: null, date: null,
      text: (text + truncNote).slice(0, 120000),
      html: null,
      meta: { totalPages, parsedPages: maxPages }
    };
  }
};
