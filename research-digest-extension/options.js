const $ = (id) => document.getElementById(id);

chrome.storage.sync.get(
  { enabled: true, baseUrl: "https://api.openai.com/v1", apiKey: "", model: "gpt-4o-mini" },
  (s) => {
    $("enabled").checked = s.enabled;
    $("baseUrl").value = s.baseUrl;
    $("apiKey").value = s.apiKey;
    $("model").value = s.model;
  }
);

$("save").onclick = () => {
  chrome.storage.sync.set(
    {
      enabled: $("enabled").checked,
      baseUrl: $("baseUrl").value.replace(/\/+$/, ""),
      apiKey: $("apiKey").value,
      model: $("model").value,
    },
    () => {
      $("saved").style.display = "inline";
      setTimeout(() => ($("saved").style.display = "none"), 2000);
    }
  );
};
