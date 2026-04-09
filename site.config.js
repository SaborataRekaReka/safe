window.SAFE_SITE_CONFIG = {
  seamenMenuLinks: [
    { href: "/seamen", label: "Услуги для моряков" },
    { href: "/shipmoney", label: "Вывод средств с Shipmoney" },
    { href: "/kadmos", label: "Вывод средств с Kadmos" },
    { href: "/company", label: "Вывод средств от компании" }
  ],
  footerLinks: [
    { href: "/shipmoney", label: "Вывод с Shipmoney" },
    { href: "/kadmos", label: "Вывод с Kadmos" },
    { href: "/company", label: "Вывод с компании" }
  ],
  contactModal: {
    title: "Актуальные способы связи",
    telegramAccount: { href: "https://t.me/Danil_Berdykin", label: "@Danil_Berdykin" },
    telegramGroup: { href: "https://t.me/exchangemoneyt", label: "https://t.me/exchangemoneyt" },
    vkGroup: { href: "https://vk.com/safe_fin", label: "https://vk.com/safe_fin" },
    email: "ask@safe-fin.com"
  }
};

window.SAFE_PARTNER_CONFIG = {
  PARTNER_QUERY_KEYS: ["partner_code", "a_aid", "ref_id"],
  STORAGE_KEY: "partner_code",
  COOKIE_KEY: "partner_code",
  COOKIE_MAX_AGE_DAYS: 30,
  BOTHELP_URL_PREFIX: "https://r.bothelp.io/tg?",
  DEFAULT_BOTHELP_LINK: "https://r.bothelp.io/tg?domain=safe_exchange_money_bot&start=c1774877924856-ds",
  AUTO_REDIRECT_TO_BOT: true,
  MAX_PARTNER_CODE_LENGTH: 100,
  AUTO_REDIRECT_DELAY_MS: 500
};
