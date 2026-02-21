chrome.action.onClicked.addListener(async (tab) => {
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["lib/Readability.js", "content_script.js"],
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
});

async function handleSummarize({ title, site, date, text }) {
  const settings = await chrome.storage.sync.get({
    enabled: true,
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: "gpt-4o-mini",
  });

  if (!settings.enabled || !settings.apiKey) {
    return { ok: false, error: "LLM not configured. Open extension settings to add your API key." };
  }

  const systemPrompt = `You are a news article summarizer. Return ONLY valid JSON (no markdown fences, no explanation) matching this exact schema:
{
  "tldr": "1-2 sentence summary",
  "key_points": ["5-7 bullet points covering the main facts"],
  "why_it_matters": ["2-3 bullets on broader significance"],
  "what_to_watch_next": ["2-3 bullets on future developments"],
  "quote_highlights": ["2-4 SHORT direct quotes from the article text — must be phrases actually present in the text, not invented"],
  "bias_or_uncertainty": ["1-2 bullets noting potential bias, missing context, or unverified claims — be cautious and fair, not accusatory. If none, return empty array."]
}
Be faithful to the article. Quotes must be verbatim from the provided text.`;

  const userMsg = [
    `Title: ${title}`,
    site ? `Source: ${site}` : "",
    date ? `Published: ${date}` : "",
    `\nArticle text:\n${text.slice(0, 120000)}`,
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
  const content = data.choices?.[0]?.message?.content || "";
  const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  try {
    return { ok: true, data: JSON.parse(cleaned) };
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return { ok: true, data: JSON.parse(match[0]) };
    throw new Error("Failed to parse LLM response as JSON");
  }
}
