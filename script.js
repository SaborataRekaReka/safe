const DEFAULT_SITE_CONFIG = {
  seamenMenuLinks: [
    { href: '/seamen', label: 'Услуги для моряков' },
    { href: '/shipmoney', label: 'Вывод средств с Shipmoney' },
    { href: '/kadmos', label: 'Вывод средств с Kadmos' },
    { href: '/company', label: 'Вывод средств от компании' }
  ],
  footerLinks: [
    { href: '/shipmoney', label: 'Вывод с Shipmoney' },
    { href: '/kadmos', label: 'Вывод с Kadmos' },
    { href: '/company', label: 'Вывод с компании' }
  ],
  legalLinks: [
    { href: '/privacy-policy', label: 'Privacy Policy' },
    { href: '/cookies-policy', label: 'Cookies Policy' },
    { href: '/terms-of-use', label: 'Terms of Use' },
    { href: '/aml-kyc', label: 'AML/KYC' }
  ],
  legalPages: {
    privacy: '/privacy-policy',
    cookies: '/cookies-policy',
    terms: '/terms-of-use',
    aml: '/aml-kyc'
  },
  contactModal: {
    title: 'Оставьте заявку',
    description: 'Укажите ваши данные и удобный контакт. Оператор свяжется с вами в ближайшее время.',
    submitLabel: 'Отправить заявку',
    operatorTelegram: { href: 'https://t.me/Danil_Berdykin', label: '@Danil_Berdykin' }
  },
  leadForm: {
    successUrl: '/thank-you',
    endpointUrl: '/lead-submit-v2.php',
    telegramWebhookUrl: '',
    telegramBotToken: '',
    telegramChatId: '',
    operatorLink: 'https://t.me/Danil_Berdykin'
  },
  cookieConsent: {
    storageKey: 'safe_cookie_consent_v1'
  }
};

const SITE_CONFIG = window.SAFE_SITE_CONFIG || DEFAULT_SITE_CONFIG;

const PROCESS_COPY = {
  title: 'Процесс перевода средств через наш сервис',
  description: 'Коротко расскажем, как проходит процесс перевода средств через наш сервис',
  steps: [
    {
      title: 'Идентификация в чате',
      text: 'Свяжитесь с оператором через Telegram. Уточните основные параметры перевода: платежная система, валюта отправки, сумма и валюта назначения.'
    },
    {
      title: 'Перевод средств на наши реквизиты',
      text: 'Оператор предоставит реквизиты для перевода.'
    },
    {
      title: 'Поступление денежных средств',
      text: 'Дождитесь зачисления денег на наш счет. Обычно это занимает от нескольких часов до трех рабочих дней. В редких случаях возможны задержки, мы всегда поможем выяснить их причины и ускорить процесс.'
    },
    {
      title: 'Получение средств на ваш счёт или другим способом',
      text: 'После поступления средств на наш счет мы переведём деньги по вашим реквизитам. Возможен вывод в разных валютах и странах по запросу.'
    }
  ]
};

const normalizeRoutePath = (value = '') => {
  if (!value) {
    return '/';
  }

  const parsedUrl = new URL(String(value), window.location.origin);
  let pathname = parsedUrl.pathname || '/';
  pathname = pathname.replace(/index\.html$/i, '');
  pathname = pathname.replace(/\.html$/i, '');

  if (!pathname.startsWith('/')) {
    pathname = `/${pathname}`;
  }

  if (pathname.length > 1) {
    pathname = pathname.replace(/\/+$/, '');
  }

  return pathname || '/';
};

const toCleanPath = (value = '') => normalizeRoutePath(value);

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const normalizeLeadValue = (value = '') => {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).replace(/\s+/g, ' ').trim();
};

const UTM_STORAGE_KEY = 'safe_lead_utm_v1';
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id'];

const readStoredUtmData = () => {
  try {
    const rawValue = window.localStorage.getItem(UTM_STORAGE_KEY);
    if (!rawValue) {
      return {};
    }

    const parsedValue = JSON.parse(rawValue);
    if (!parsedValue || typeof parsedValue !== 'object' || Array.isArray(parsedValue)) {
      return {};
    }

    return UTM_KEYS.reduce((accumulator, key) => {
      const normalizedValue = normalizeLeadValue(parsedValue[key]);
      if (normalizedValue) {
        accumulator[key] = normalizedValue.slice(0, 200);
      }
      return accumulator;
    }, {});
  } catch {
    return {};
  }
};

const writeStoredUtmData = (utmData) => {
  try {
    window.localStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(utmData));
  } catch {
    // Ignore storage access errors.
  }
};

const collectUtmDataForLead = () => {
  const queryParams = new URLSearchParams(window.location.search || '');
  const currentUtmData = {};

  UTM_KEYS.forEach((key) => {
    const normalizedValue = normalizeLeadValue(queryParams.get(key));
    if (normalizedValue) {
      currentUtmData[key] = normalizedValue.slice(0, 200);
    }
  });

  const storedUtmData = readStoredUtmData();
  const mergedUtmData = { ...storedUtmData, ...currentUtmData };

  if (Object.keys(currentUtmData).length > 0) {
    writeStoredUtmData(mergedUtmData);
  }

  return mergedUtmData;
};

const redirectLegacyHtmlPath = () => {
  const pathname = window.location.pathname || '/';
  const isLegacyHtml = /\.html$/i.test(pathname);
  if (!isLegacyHtml) {
    return;
  }

  const targetPath = normalizeRoutePath(pathname);
  const targetUrl = `${targetPath}${window.location.search || ''}${window.location.hash || ''}`;
  window.location.replace(targetUrl);
};

redirectLegacyHtmlPath();

const isMarTrustLink = (href = '') => {
  if (!href) {
    return false;
  }

  try {
    const resolvedUrl = new URL(href, window.location.origin);
    const pathname = resolvedUrl.pathname.toLowerCase();
    return pathname.endsWith('/martrust.html') || pathname.endsWith('/martrust');
  } catch {
    const normalizedHref = String(href).toLowerCase();
    return normalizedHref.includes('martrust.html') || /\/martrust(?:$|[?#/])/.test(normalizedHref);
  }
};

const getTelegramUsername = (rawHref = '') => {
  if (!rawHref) {
    return '';
  }

  let resolvedUrl;
  try {
    resolvedUrl = new URL(rawHref, window.location.origin);
  } catch {
    return '';
  }

  if (resolvedUrl.hostname.toLowerCase() !== 't.me') {
    return '';
  }

  const pathname = resolvedUrl.pathname.replace(/^\/+/, '');
  return pathname.replace(/^@/, '').toLowerCase();
};

const getOperatorUsernames = () => {
  const usernames = new Set();
  const modalOperator = SITE_CONFIG.contactModal?.operatorTelegram?.href || '';
  const leadOperator = SITE_CONFIG.leadForm?.operatorLink || '';

  [modalOperator, leadOperator].forEach((href) => {
    const username = getTelegramUsername(href);
    if (username) {
      usernames.add(username);
    }
  });

  return usernames;
};

const OPERATOR_USERNAMES = getOperatorUsernames();

const isOperatorTelegramHref = (rawHref = '') => {
  if (!rawHref || OPERATOR_USERNAMES.size === 0) {
    return false;
  }

  const username = getTelegramUsername(rawHref);
  return username ? OPERATOR_USERNAMES.has(username) : false;
};

const SEAMEN_MENU_LINKS = SITE_CONFIG.seamenMenuLinks.filter((item) => !isMarTrustLink(item.href));
const FOOTER_LINKS = SITE_CONFIG.footerLinks.filter((item) => !isMarTrustLink(item.href));
const LEGAL_LINKS = Array.isArray(SITE_CONFIG.legalLinks) ? SITE_CONFIG.legalLinks : [];

const CURRENT_PATH = normalizeRoutePath(window.location.pathname);
const SEAMEN_PAGES = new Set(SEAMEN_MENU_LINKS.map((item) => normalizeRoutePath(item.href)));

const renderSeamenSubmenu = () => {
  document.querySelectorAll('.main-nav__submenu').forEach((submenu) => {
    submenu.removeAttribute('role');
    submenu.innerHTML = SEAMEN_MENU_LINKS
      .map((item) => {
        const itemPath = normalizeRoutePath(item.href);
        const activeClass = itemPath === CURRENT_PATH ? ' main-nav__submenu-link--active' : '';
        return `<a class="main-nav__submenu-link${activeClass}" href="${toCleanPath(item.href)}">${item.label}</a>`;
      })
      .join('');
  });

  document.querySelectorAll('.main-nav__toggle').forEach((toggleButton) => {
    toggleButton.classList.toggle('main-nav__link--active', SEAMEN_PAGES.has(CURRENT_PATH));
  });
};

const syncMainNavActiveLink = () => {
  document.querySelectorAll('.main-nav > a.main-nav__link').forEach((link) => {
    const href = link.getAttribute('href') || '';
    const normalizedHref = normalizeRoutePath(href);
    const isPageLink = !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:');
    const isActive = isPageLink && normalizedHref === CURRENT_PATH;
    link.classList.toggle('main-nav__link--active', isActive);
  });
};

const renderFooter = () => {
  document.querySelectorAll('.site-footer__brand').forEach((brandLink) => {
    brandLink.setAttribute('href', '/');
  });

  document.querySelectorAll('.site-footer__menu ul').forEach((list) => {
    list.innerHTML = FOOTER_LINKS.map((item) => `<li><a href="${toCleanPath(item.href)}">${item.label}</a></li>`).join('');
  });
};

const renderFooterLegalLinks = () => {
  if (LEGAL_LINKS.length === 0) {
    return;
  }

  document.querySelectorAll('.site-footer__content').forEach((content) => {
    let legalWrap = content.querySelector('.site-footer__legal');
    if (!legalWrap) {
      legalWrap = document.createElement('div');
      legalWrap.className = 'site-footer__legal';
      content.append(legalWrap);
    }

    legalWrap.innerHTML = LEGAL_LINKS
      .map((item) => `<a class="site-footer__legal-link" href="${toCleanPath(item.href)}">${item.label}</a>`)
      .join('');
  });
};

const rewriteInternalHtmlLinks = () => {
  document.querySelectorAll('a[href]').forEach((link) => {
    const href = link.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
      return;
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(href, window.location.origin);
    } catch {
      return;
    }

    if (parsedUrl.origin !== window.location.origin) {
      return;
    }

    const cleanPath = normalizeRoutePath(parsedUrl.pathname);
    const cleanHref = `${cleanPath}${parsedUrl.search || ''}${parsedUrl.hash || ''}`;
    link.setAttribute('href', cleanHref);
  });
};

const sanitizeMarTrustLinksInMenu = () => {
  document.querySelectorAll('.main-nav__submenu a, .site-footer__menu a').forEach((link) => {
    if (!isMarTrustLink(link.getAttribute('href') || '')) {
      return;
    }

    const listItem = link.closest('li');
    if (listItem) {
      listItem.remove();
      return;
    }

    link.remove();
  });
};

const syncProcessSections = () => {
  document.querySelectorAll('.process').forEach((section) => {
    const title = section.querySelector('.process__title');
    const description = section.querySelector('.process__descr');
    const list = section.querySelector('.process__list');

    if (!title || !description || !list) {
      return;
    }

    title.textContent = PROCESS_COPY.title;
    description.textContent = PROCESS_COPY.description;
    list.innerHTML = PROCESS_COPY.steps
      .map(
        (item) => `
        <li class="process-step">
          <span class="process-step__num" aria-hidden="true"></span>
          <div class="process-step__text">
            <h3>${escapeHtml(item.title)}</h3>
            <p>${escapeHtml(item.text)}</p>
          </div>
        </li>`
      )
      .join('');
  });
};

const normalizeContactTriggers = () => {
  document.querySelectorAll('a[href="#contactform"]').forEach((link) => {
    link.setAttribute('data-open-contact-modal', '');
  });

  document.querySelectorAll('a[href]').forEach((link) => {
    if (link.hasAttribute('data-allow-direct-telegram')) {
      return;
    }

    const href = link.getAttribute('href') || '';
    if (!isOperatorTelegramHref(href)) {
      return;
    }

    link.setAttribute('href', '#contactform');
    link.setAttribute('data-open-contact-modal', '');
    link.removeAttribute('target');
  });
};

const getLegalPath = (type, fallbackValue) => {
  const value = SITE_CONFIG.legalPages?.[type] || fallbackValue;
  return toCleanPath(value);
};

const createOrSyncContactModal = () => {
  let modal = document.querySelector('#contact-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'contact-modal';
    document.body.append(modal);
  }

  modal.className = 'contact-modal';
  modal.setAttribute('aria-hidden', 'true');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'contact-modal-title');

  const contactModalConfig = SITE_CONFIG.contactModal || {};
  const title = contactModalConfig.title || 'Оставьте заявку';
  const description =
    contactModalConfig.description ||
    'Укажите ваши данные и удобный контакт. Оператор свяжется с вами в ближайшее время.';
  const submitLabel = contactModalConfig.submitLabel || 'Отправить заявку';
  const privacyPath = getLegalPath('privacy', '/privacy-policy');
  const termsPath = getLegalPath('terms', '/terms-of-use');

  modal.innerHTML = `
    <button class="contact-modal__backdrop" type="button" aria-label="Закрыть" data-contact-modal-close></button>
    <div class="contact-modal__dialog" role="document">
      <button class="contact-modal__close" type="button" aria-label="Закрыть" data-contact-modal-close>
        <span aria-hidden="true">&times;</span>
      </button>
      <h2 class="contact-modal__title" id="contact-modal-title">${escapeHtml(title)}</h2>
      <div class="contact-modal__content">
        <p class="contact-modal__lead">${escapeHtml(description)}</p>
        <form class="contact-form" data-contact-form novalidate>
          <label class="contact-form__field" for="contact-name">
            <span class="contact-form__label">Имя</span>
            <input class="contact-form__input" id="contact-name" name="name" type="text" autocomplete="name" required />
          </label>
          <label class="contact-form__field" for="contact-point">
            <span class="contact-form__label">Telegram или телефон</span>
            <input class="contact-form__input" id="contact-point" name="contact" type="text" autocomplete="tel" required />
          </label>
          <label class="contact-form__field" for="contact-message">
            <span class="contact-form__label">Комментарий (необязательно)</span>
            <textarea class="contact-form__textarea" id="contact-message" name="message" rows="3" maxlength="800"></textarea>
          </label>
          <label class="contact-form__consent" for="contact-consent">
            <input class="contact-form__checkbox" id="contact-consent" name="privacyConsent" type="checkbox" required />
            <span>
              Я соглашаюсь с
              <a href="${privacyPath}" target="_blank" rel="noopener noreferrer">политикой обработки персональных данных</a>
              и
              <a href="${termsPath}" target="_blank" rel="noopener noreferrer">условиями использования</a>.
            </span>
          </label>
          <p class="contact-form__status" data-contact-form-status aria-live="polite"></p>
          <button class="contact-form__submit btn btn--size-cta btn--filled-accent" type="submit">${escapeHtml(submitLabel)}</button>
        </form>
      </div>
    </div>`;

  return modal;
};

const getLeadFormConfig = () => SITE_CONFIG.leadForm || {};

const buildLeadPayload = ({ name, contact, message }) => ({
  name,
  contact,
  message,
  pageTitle: document.title,
  pageUrl: window.location.href,
  createdAt: new Date().toISOString(),
  userAgent: navigator.userAgent,
  utm: collectUtmDataForLead()
});

const buildLeadMessage = (payload) => {
  const lines = [
    'Новая заявка с сайта SAFE',
    '',
    `Имя: ${payload.name}`,
    `Контакт: ${payload.contact}`,
    `Комментарий: ${payload.message || 'не указан'}`,
    '',
    `Страница: ${payload.pageTitle}`,
    `URL: ${payload.pageUrl}`,
    `Дата: ${new Date(payload.createdAt).toLocaleString('ru-RU')}`
  ];

  const utmLines = UTM_KEYS.map((key) => {
    if (!payload.utm || typeof payload.utm !== 'object') {
      return '';
    }

    const normalizedValue = normalizeLeadValue(payload.utm[key]);
    return normalizedValue ? `${key}: ${normalizedValue}` : '';
  }).filter(Boolean);

  if (utmLines.length > 0) {
    lines.push('');
    lines.push('UTM-метки:');
    lines.push(...utmLines);
  }

  return lines.join('\n');
};

const sendLeadToWebhook = async (payload, webhookUrl) => {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error('WEBHOOK_SEND_FAILED');
  }
};

const sendLeadToServerEndpoint = async (payload, endpointUrl) => {
  const response = await fetch(endpointUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const responseBody = await response.text();
  let responseData = null;
  if (responseBody) {
    try {
      responseData = JSON.parse(responseBody);
    } catch {
      responseData = null;
    }
  }

  if (!response.ok) {
    const errorCode = responseData && responseData.error ? responseData.error : 'server_endpoint_send_failed';
    throw new Error(errorCode);
  }

  if (!responseData) {
    throw new Error('server_endpoint_invalid_response');
  }

  if (responseData.ok !== true) {
    const endpointError = new Error(responseData.error || 'server_endpoint_invalid_response');
    if (responseData.detail && typeof responseData.detail === 'object') {
      endpointError.details = responseData.detail;
    }
    throw endpointError;
  }
};

const sendLeadToTelegramApi = async (message, token, chatId) => {
  const endpoint = `https://api.telegram.org/bot${token}/sendMessage`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
    },
    body: new URLSearchParams({
      chat_id: chatId,
      text: message
    })
  });

  if (!response.ok) {
    throw new Error('TELEGRAM_API_SEND_FAILED');
  }
};

const sendLeadToOperatorLink = (message, operatorLink) => {
  if (!operatorLink) {
    throw new Error('OPERATOR_LINK_MISSING');
  }

  const url = new URL(operatorLink, window.location.origin);
  if (url.hostname.toLowerCase() === 't.me') {
    url.searchParams.set('text', message);
  }

  window.open(url.toString(), '_blank', 'noopener,noreferrer');
};

const deliverLead = async (payload) => {
  const leadConfig = getLeadFormConfig();
  const message = buildLeadMessage(payload);

  if (leadConfig.endpointUrl) {
    await sendLeadToServerEndpoint(payload, leadConfig.endpointUrl);
    return;
  }

  if (leadConfig.telegramWebhookUrl) {
    await sendLeadToWebhook(payload, leadConfig.telegramWebhookUrl);
    return;
  }

  if (leadConfig.telegramBotToken && leadConfig.telegramChatId) {
    await sendLeadToTelegramApi(message, leadConfig.telegramBotToken, leadConfig.telegramChatId);
    return;
  }

  sendLeadToOperatorLink(message, leadConfig.operatorLink || SITE_CONFIG.contactModal?.operatorTelegram?.href);
};

const initThankYouPageRedirect = () => {
  const thankYouSection = document.querySelector('.thank-you-page');
  if (!thankYouSection) {
    return;
  }

  const preferredRedirect = normalizeLeadValue(thankYouSection.getAttribute('data-thank-you-redirect'));
  const configRedirect = normalizeLeadValue(
    getLeadFormConfig().operatorLink || SITE_CONFIG.contactModal?.operatorTelegram?.href || ''
  );
  const redirectCandidate = preferredRedirect || configRedirect;

  if (!redirectCandidate) {
    return;
  }

  let redirectUrl = '';
  try {
    redirectUrl = new URL(redirectCandidate, window.location.origin).toString();
  } catch {
    return;
  }

  const redirectDelayFromMarkup = Number.parseInt(
    thankYouSection.getAttribute('data-thank-you-redirect-delay-ms') || '2000',
    10
  );
  const redirectDelayMs = Number.isFinite(redirectDelayFromMarkup)
    ? Math.max(0, redirectDelayFromMarkup)
    : 2000;

  const statusNode = thankYouSection.querySelector('[data-thank-you-redirect-status]');
  if (statusNode && !statusNode.textContent.trim()) {
    statusNode.textContent = 'Через 2 секунды автоматически откроем диалог в Telegram.';
  }

  window.setTimeout(() => {
    window.location.assign(redirectUrl);
  }, redirectDelayMs);
};

const initNavigation = () => {
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('#main-nav');
  const navDropdownItems = Array.from(document.querySelectorAll('.main-nav__item--dropdown'));

  const closeNavDropdowns = () => {
    navDropdownItems.forEach((item) => {
      item.classList.remove('main-nav__item--open');
      const itemToggle = item.querySelector('.main-nav__toggle');
      if (itemToggle) {
        itemToggle.setAttribute('aria-expanded', 'false');
      }
    });
  };

  navDropdownItems.forEach((item) => {
    const itemToggle = item.querySelector('.main-nav__toggle');
    if (!itemToggle) {
      return;
    }

    itemToggle.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const isOpen = item.classList.toggle('main-nav__item--open');

      navDropdownItems.forEach((otherItem) => {
        if (otherItem === item) {
          return;
        }
        otherItem.classList.remove('main-nav__item--open');
        const otherToggle = otherItem.querySelector('.main-nav__toggle');
        if (otherToggle) {
          otherToggle.setAttribute('aria-expanded', 'false');
        }
      });

      itemToggle.setAttribute('aria-expanded', String(isOpen));
    });
  });

  document.addEventListener('click', (event) => {
    if (navDropdownItems.some((item) => item.contains(event.target))) {
      return;
    }
    closeNavDropdowns();
  });

  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('main-nav--open');
      toggle.setAttribute('aria-expanded', String(isOpen));
      if (!isOpen) {
        closeNavDropdowns();
      }
    });

    nav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        nav.classList.remove('main-nav--open');
        toggle.setAttribute('aria-expanded', 'false');
        closeNavDropdowns();
      });
    });
  }

  return { closeNavDropdowns, nav, toggle };
};

const initContactModal = () => {
  const modalOpenTriggers = Array.from(
    document.querySelectorAll('[data-open-contact-modal], a[href="#contactform"]')
  );

  if (modalOpenTriggers.length === 0) {
    return null;
  }

  const contactModal = createOrSyncContactModal();
  const modalCloseTriggers = contactModal.querySelectorAll('[data-contact-modal-close]');
  const modalCloseButton = contactModal.querySelector('.contact-modal__close');
  const contactForm = contactModal.querySelector('[data-contact-form]');
  const statusNode = contactModal.querySelector('[data-contact-form-status]');
  const submitButton = contactModal.querySelector('.contact-form__submit');

  const setStatus = (message, isError = false) => {
    if (!statusNode) {
      return;
    }

    statusNode.textContent = message;
    statusNode.classList.toggle('is-error', isError);
    statusNode.classList.toggle('is-success', !isError && Boolean(message));
  };

  const openContactModal = () => {
    contactModal.classList.add('is-open');
    contactModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    setStatus('');
    if (modalCloseButton) {
      modalCloseButton.focus();
    }
  };

  const closeContactModal = () => {
    contactModal.classList.remove('is-open');
    contactModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    setStatus('');
  };

  modalOpenTriggers.forEach((trigger) => {
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      openContactModal();
    });
  });

  modalCloseTriggers.forEach((trigger) => {
    trigger.addEventListener('click', closeContactModal);
  });

  if (contactForm) {
    contactForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      setStatus('');

      const formData = new FormData(contactForm);
      const name = normalizeLeadValue(formData.get('name'));
      const contact = normalizeLeadValue(formData.get('contact'));
      const message = normalizeLeadValue(formData.get('message'));
      const hasConsent = formData.get('privacyConsent') === 'on';

      if (name.length < 2) {
        setStatus('Укажите корректное имя.', true);
        return;
      }

      if (contact.length < 3) {
        setStatus('Укажите контакт в Telegram или номер телефона.', true);
        return;
      }

      if (!hasConsent) {
        setStatus('Подтвердите согласие с политикой обработки персональных данных.', true);
        return;
      }

      const payload = buildLeadPayload({ name, contact, message });

      if (submitButton) {
        submitButton.disabled = true;
      }

      setStatus('Отправляем заявку...');

      try {
        await deliverLead(payload);
        contactForm.reset();
        closeContactModal();

        const successUrl = toCleanPath(getLeadFormConfig().successUrl || '/thank-you');
        window.location.assign(successUrl);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '';
        const errorDetails =
          error && typeof error === 'object' && 'details' in error ? error.details : null;

        if (errorMessage === 'telegram_not_configured') {
          setStatus('Сервис недоступен: Telegram не настроен на сервере. Сообщите администратору.', true);
        } else if (errorMessage === 'telegram_send_failed') {
          const detailError =
            errorDetails && typeof errorDetails === 'object' ? String(errorDetails.error || '') : '';
          const detailDescription =
            errorDetails && typeof errorDetails === 'object' ? String(errorDetails.description || '') : '';

          if (detailError === 'curl_transport_error' || detailError === 'stream_transport_error') {
            setStatus(
              'Сервер не может подключиться к API Telegram. Проверьте сетевой доступ хостинга к api.telegram.org.',
              true
            );
          } else if (detailDescription.toLowerCase().includes('chat not found')) {
            setStatus('Telegram вернул chat not found. Проверьте chat id и что бот добавлен в нужный чат.', true);
          } else {
            setStatus('Не удалось доставить заявку в Telegram. Проверьте chat id и что бот имеет доступ к чату.', true);
          }
        } else {
          setStatus('Не удалось отправить заявку. Попробуйте еще раз или свяжитесь с оператором в Telegram.', true);
        }
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
        }
      }
    });
  }

  return { closeContactModal, contactModal };
};

const getStoredConsent = (storageKey) => {
  try {
    return window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
};

const storeConsent = (storageKey, value) => {
  try {
    window.localStorage.setItem(storageKey, value);
  } catch {
    // Ignore storage access errors.
  }
};

const initCookieConsent = () => {
  const storageKey = SITE_CONFIG.cookieConsent?.storageKey || 'safe_cookie_consent_v1';
  if (getStoredConsent(storageKey)) {
    return;
  }

  const privacyPath = getLegalPath('privacy', '/privacy-policy');
  const cookiesPath = getLegalPath('cookies', '/cookies-policy');

  const banner = document.createElement('aside');
  banner.className = 'cookie-consent';
  banner.setAttribute('role', 'dialog');
  banner.setAttribute('aria-live', 'polite');
  banner.innerHTML = `
    <div class="cookie-consent__inner">
      <p class="cookie-consent__text">
        Мы используем cookie для корректной работы сайта и аналитики. Продолжая использовать сайт, вы соглашаетесь с
        <a href="${privacyPath}" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
        и
        <a href="${cookiesPath}" target="_blank" rel="noopener noreferrer">Cookies Policy</a>.
      </p>
      <button class="cookie-consent__btn btn btn--size-cta btn--outline-light" type="button" data-cookie-consent-accept>
        Принять
      </button>
    </div>`;

  document.body.append(banner);

  const acceptButton = banner.querySelector('[data-cookie-consent-accept]');
  if (acceptButton) {
    acceptButton.addEventListener('click', () => {
      storeConsent(storageKey, 'accepted');
      banner.remove();
    });
  }
};

renderSeamenSubmenu();
syncMainNavActiveLink();
renderFooter();
renderFooterLegalLinks();
sanitizeMarTrustLinksInMenu();
syncProcessSections();
rewriteInternalHtmlLinks();
normalizeContactTriggers();
collectUtmDataForLead();

const navState = initNavigation();
const modalState = initContactModal();
initCookieConsent();
initThankYouPageRedirect();

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') {
    return;
  }

  if (modalState && modalState.contactModal.classList.contains('is-open')) {
    modalState.closeContactModal();
    return;
  }

  if (navState) {
    navState.closeNavDropdowns();
    if (navState.nav && navState.toggle) {
      navState.nav.classList.remove('main-nav--open');
      navState.toggle.setAttribute('aria-expanded', 'false');
    }
  }
});
