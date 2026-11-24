const languages = new Set(["az", "ru", "en"]);
const storageKey = "seth.lang";
const stringsUrl = new URL("../../data/i18n.json", import.meta.url);

async function loadStrings() {
  if (stringsUrl.protocol === "file:" && typeof process !== "undefined" && process.versions?.node) {
    const { readFile } = await import("node:fs/promises");
    return JSON.parse(await readFile(stringsUrl, "utf8"));
  }

  const response = await fetch(stringsUrl);
  if (!response.ok) throw new Error(`Could not load translations (HTTP ${response.status}).`);
  return response.json();
}

const strings = await loadStrings();
const missing = new Set();
let selected;

/** Read the selected language, giving a supported URL parameter priority over saved preferences. */
export function getLang() {
  if (selected) return selected;
  const query = new URLSearchParams(globalThis.location?.search).get("lang");
  if (languages.has(query)) return query;
  try {
    const saved = globalThis.localStorage?.getItem(storageKey);
    if (languages.has(saved)) return saved;
  } catch {
    // Storage may be blocked by the browser.
  }
  return "az";
}

/** Select a supported language and persist it in browser storage and the current URL. */
export function setLang(lang) {
  if (!languages.has(lang)) return getLang();
  selected = lang;
  try {
    globalThis.localStorage?.setItem(storageKey, lang);
  } catch {
    // The selection still works for the current page.
  }
  if (globalThis.location && globalThis.history) {
    const url = new URL(globalThis.location.href);
    url.searchParams.set("lang", lang);
    globalThis.history.replaceState(globalThis.history.state, "", url);
  }
  return lang;
}

/** Translate a dotted key, warning once for an unknown key. */
export function t(key, lang = getLang()) {
  if (Object.hasOwn(strings, key)) return strings[key][languages.has(lang) ? lang : "az"];
  if (!missing.has(key)) {
    missing.add(key);
    console.warn(`Missing translation: ${key}`);
  }
  return key;
}
