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
  legalLinks: [
    { href: "/privacy-policy", label: "Privacy Policy" },
    { href: "/cookies-policy", label: "Cookies Policy" },
    { href: "/terms-of-use", label: "Terms of Use" },
    { href: "/aml-kyc", label: "AML/KYC" }
  ],
  contactModal: {
    title: "Оставьте заявку",
    description: "Укажите ваши данные и удобный контакт. Оператор свяжется с вами в ближайшее время.",
    submitLabel: "Отправить заявку",
    operatorTelegram: { href: "https://t.me/Danil_Berdykin", label: "@Danil_Berdykin" }
  },
  legalPages: {
    privacy: "/privacy-policy",
    cookies: "/cookies-policy",
    terms: "/terms-of-use",
    aml: "/aml-kyc"
  },
  leadForm: {
    successUrl: "/thank-you",
    endpointUrl: "/lead-submit.php",
    telegramWebhookUrl: "",
    telegramBotToken: "",
    telegramChatId: "",
    operatorLink: "https://t.me/Danil_Berdykin"
  },
  cookieConsent: {
    storageKey: "safe_cookie_consent_v1"
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
