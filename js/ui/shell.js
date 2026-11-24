import { getLang, setLang, t } from "../core/i18n.js";
import { pageUrl } from "./data.js";

const langs = ["az", "ru", "en"];

export const icons = {
  brand: `<svg class="brand__mark" viewBox="0 0 32 32" aria-hidden="true">
    <rect x="1.5" y="1.5" width="16" height="10" fill="#843620"/>
    <rect x="20" y="1.5" width="10.5" height="16" fill="#1C1B19"/>
    <rect x="1.5" y="14" width="16" height="16.5" fill="#C4B9A8"/>
    <rect x="20" y="20" width="10.5" height="10.5" fill="#843620"/>
  </svg>`,
  arrowRight: `<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12M11 5l5 5-5 5"/></svg>`,
  arrowLeft: `<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M16 10H4M9 5l-5 5 5 5"/></svg>`,
  search: `<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="5.5"/><path d="m13.5 13.5 3.5 3.5"/></svg>`,
  close: `<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15"/></svg>`,
  menu: `<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 6h14M3 10h14M3 14h14"/></svg>`,
  grid: `<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="3" width="6" height="6"/><rect x="11" y="3" width="6" height="6"/><rect x="3" y="11" width="6" height="6"/><rect x="11" y="11" width="6" height="6"/></svg>`,
  list: `<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14"/></svg>`,
  filter: `<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M6 10h8M8.5 15h3"/></svg>`,
  upload: `<svg class="icon drop-zone__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V5M7 9l5-4 5 4"/><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/></svg>`,
  download: `<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v10M6 9l4 4 4-4"/><path d="M3 16h14"/></svg>`,
  whatsapp: `<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5a7.5 7.5 0 0 0-6.5 11.2L2.5 17.5l3.9-1A7.5 7.5 0 1 0 10 2.5Z"/><path d="M7.5 7.6c.2-.4.5-.4.7-.4h.5c.2 0 .4.1.5.4l.6 1.4c.1.2.1.4 0 .6l-.4.5c.5.9 1.3 1.6 2.2 2l.5-.4c.2-.1.4-.1.6 0l1.3.6c.3.1.4.3.4.5v.5c0 .3-.2.6-.5.8-.5.3-1.2.4-2 .1-1.9-.6-3.7-2.2-4.5-4.1-.3-.8-.2-1.5.1-2Z"/></svg>`,
};

/**
 * Mount shared header, footer, language switching and document head i18n.
 * @param {{ active: 'home'|'catalog'|'product'|'admin', titleKey: string, descKey?: string, onLangChange?: (lang:string)=>void }} opts
 */
export function initShell(opts) {
  const headerSlot = document.getElementById("site-header");
  const footerSlot = document.getElementById("site-footer");
  const skipLink = document.querySelector(".skip-link");

  function renderChrome(lang) {
    document.documentElement.lang = lang;

    if (opts.titleKey) {
      document.title = t(opts.titleKey, lang);
    }
    if (opts.descKey) {
      const descEl = document.querySelector('meta[name="description"]');
      if (descEl) descEl.setAttribute("content", t(opts.descKey, lang));
    }
    if (skipLink) {
      skipLink.textContent = t("common.skipToContent", lang);
    }

    if (headerSlot) {
      const homeHref = pageUrl("index.html", {}, lang);
      const catHref = pageUrl("katalog/index.html", {}, lang);
      const adminHref = pageUrl("admin/index.html", {}, lang);

      headerSlot.innerHTML = `
        <div class="wrap site-header__inner">
          <a class="brand" href="${homeHref}" aria-label="${t("site.name", lang)} — ${t("nav.home", lang)}">
            ${icons.brand}
            <span class="brand__name">${t("site.name", lang)}</span>
            <span class="brand__tag">${t("site.tagline", lang)}</span>
          </a>
          <nav class="site-nav" id="primary-nav" aria-label="${t("nav.menu", lang)}">
            <a class="site-nav__link" href="${homeHref}" ${opts.active === "home" ? 'aria-current="page"' : ""}>${t("nav.home", lang)}</a>
            <a class="site-nav__link" href="${catHref}" ${opts.active === "catalog" || opts.active === "product" ? 'aria-current="page"' : ""}>${t("nav.catalog", lang)}</a>
            <a class="site-nav__link" href="${adminHref}" ${opts.active === "admin" ? 'aria-current="page"' : ""}>${t("nav.admin", lang)}</a>
          </nav>
          <div class="header-controls">
            <div class="lang-switch" role="group" aria-label="${t("nav.language", lang)}">
              ${langs.map((code) => `
                <button type="button" class="lang-switch__btn" data-lang="${code}" aria-pressed="${code === lang}" title="${t("lang." + code, lang)}">${code.toUpperCase()}</button>
              `).join("")}
            </div>
            <button type="button" class="nav-toggle" id="nav-toggle" aria-expanded="false" aria-controls="primary-nav">
              ${icons.menu}
              <span class="sr-only">${t("nav.menu", lang)}</span>
            </button>
          </div>
        </div>
      `;

      const toggle = headerSlot.querySelector("#nav-toggle");
      const nav = headerSlot.querySelector("#primary-nav");
      toggle?.addEventListener("click", () => {
        const open = !nav.classList.contains("is-open");
        nav.classList.toggle("is-open", open);
        toggle.setAttribute("aria-expanded", String(open));
      });

      headerSlot.querySelectorAll("[data-lang]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const next = btn.getAttribute("data-lang");
          if (next === getLang()) return;
          setLang(next);
          renderChrome(next);
          opts.onLangChange?.(next);
        });
      });
    }

    if (footerSlot) {
      const homeHref = pageUrl("index.html", {}, lang);
      const catHref = pageUrl("katalog/index.html", {}, lang);
      const adminHref = pageUrl("admin/index.html", {}, lang);
      const phone = t("whatsapp.phone", lang);
      const digits = phone.replace(/\D/g, "");

      footerSlot.innerHTML = `
        <div class="wrap">
          <div class="footer-grid">
            <div>
              <a class="brand" href="${homeHref}">
                ${icons.brand}
                <span class="brand__name">${t("site.name", lang)}</span>
              </a>
              <p style="margin-top:10px;color:var(--muted);max-width:36ch;">
                ${t("site.tagline", lang)} · ${t("site.location", lang)}
              </p>
            </div>
            <div>
              <h2 class="footer-title">${t("nav.menu", lang)}</h2>
              <div class="footer-links">
                <a href="${homeHref}">${t("nav.home", lang)}</a>
                <a href="${catHref}">${t("nav.catalog", lang)}</a>
                <a href="${adminHref}">${t("nav.admin", lang)}</a>
              </div>
            </div>
            <div>
              <h2 class="footer-title">WhatsApp</h2>
              <div class="footer-links">
                <a href="https://wa.me/${digits}" target="_blank" rel="noopener noreferrer" class="tabular">${phone}</a>
                <span style="font-size:12.5px;color:var(--accent);font-weight:600;">${t("whatsapp.placeholder", lang)}</span>
              </div>
            </div>
          </div>
          <div class="footer-bottom">
            <p>${t("footer.note", lang)}</p>
            <span>${t("site.name", lang)} · ${t("site.location", lang)}</span>
          </div>
        </div>
      `;
    }
  }

  renderChrome(getLang());
  return {
    refresh: () => renderChrome(getLang()),
  };
}
