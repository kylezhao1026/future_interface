chrome.action.onClicked.addListener(async (tab) => {
  const url = tab.url || "";
  const isPdf = /\.pdf(\?|#|$)/i.test(url) ||
    url.includes("drive.google.com/file/d/") ||
    (tab.title || "").endsWith(".pdf");

  const files = [
    "lib/Readability.js",
    ...(isPdf ? ["lib/pdfjs/pdf.min.js"] : []),
    "adapters/google_docs.js",
    "adapters/google_slides.js",
    "adapters/pdf.js",
    "adapters/wikipedia.js",
    "adapters/article.js",
    "content_script.js",
  ];

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files,
  });
  chrome.tabs.sendMessage(tab.id, { action: "open_overlay" });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "summarize") {
    handleSummarize(msg.payload).then(sendResponse).catch((e) =>
      sendResponse({ ok: false, error: e.message })
    );
    return true;
  }
  if (msg.action === "load_pdfjs") {
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      files: ["lib/pdfjs/pdf.min.js"],
    }).then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
});

const KIND_INSTRUCTIONS = {
  article: "This is a news article. Focus on facts, context, and significance.",
  wikipedia: "This is a Wikipedia article. Focus on concise definition, key facts, and structure. Use an encyclopedic tone.",
  gdoc: "This is a Google Doc. Summarize the document's structure, main points, and any action items or decisions mentioned.",
  gslides: "This is a Google Slides presentation. Produce key points and a concise talk-track style summary. Organize by slide themes.",
  pdf: "This is a PDF document. Summarize the main content faithfully. If only partial pages were provided, note that in bias_or_uncertainty.",
};

async function handleSummarize({ kind, title, site, date, text }) {
  const settings = await chrome.storage.sync.get({
    enabled: true,
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: "gpt-4o-mini",
  });

  if (!settings.enabled || !settings.apiKey) {
    return { ok: false, error: "LLM not configured. Open extension settings to add your API key." };
  }

  const systemPrompt = `You are a content summarizer. ${KIND_INSTRUCTIONS[kind] || KIND_INSTRUCTIONS.article}

Return ONLY valid JSON (no markdown fences, no explanation) matching this exact schema:
{
  "tldr": "1-2 sentence summary",
  "key_points": ["5-7 bullet points covering the main facts"],
  "why_it_matters": ["2-3 bullets on broader significance"],
  "what_to_watch_next": ["2-3 bullets on future developments or related topics"],
  "quote_highlights": ["2-4 SHORT direct quotes — MUST be exact substrings from the provided text, never paraphrased or invented. If uncertain, return empty array."],
  "bias_or_uncertainty": ["1-2 bullets on potential bias, missing context, or limitations. Be cautious and fair. If none, return empty array."]
}
Be faithful to the content. Never invent quotes.`;

  const userMsg = [
    `Title: ${title}`,
    site ? `Source: ${site}` : "",
    date ? `Date: ${date}` : "",
    `\nContent (${kind}):\n${text.slice(0, 120000)}`,
  ].filter(Boolean).join("\n");

  const res = await fetch(`${settings.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMsg },
      ],
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || "";
  const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  try {
    return { ok: true, data: JSON.parse(cleaned) };
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return { ok: true, data: JSON.parse(match[0]) };
    throw new Error("Failed to parse LLM response as JSON");
  }
}
