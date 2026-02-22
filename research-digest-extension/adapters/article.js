var ArticleAdapter = {
  canHandle() { return true; },

  async extract() {
    const clone = document.cloneNode(true);
    const parsed = new Readability(clone).parse() || {};
    const title = parsed.title || document.querySelector('meta[property="og:title"]')?.content || document.title;
    const byline = parsed.byline || document.querySelector('meta[name="author"]')?.content || "";
    const siteName = parsed.siteName || document.querySelector('meta[property="og:site_name"]')?.content || location.hostname.replace(/^www\./, "");
    const pt = parsed.publishedTime || document.querySelector('meta[property="article:published_time"]')?.content || document.querySelector('meta[name="pubdate"]')?.content || document.querySelector("time[datetime]")?.getAttribute("datetime") || "";
    let date = "";
    if (pt) { try { date = new Date(pt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }); } catch { date = pt; } }
    return {
      kind: "article", url: location.href, title, source: siteName,
      author: byline || null, date: date || null,
      text: parsed.textContent || document.body.innerText,
      html: parsed.content || null, meta: null
    };
  }
};
