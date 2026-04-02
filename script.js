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
  contactModal: {
    title: 'Актуальные способы связи',
    telegramAccount: { href: 'https://t.me/Danil_Berdykin', label: '@Danil_Berdykin' },
    telegramGroup: { href: 'https://t.me/exchangemoneyt', label: 'https://t.me/exchangemoneyt' },
    vkGroup: { href: 'https://vk.com/safe_fin', label: 'https://vk.com/safe_fin' },
    email: 'ask@safe-fin.com'
  }
};

const SITE_CONFIG = window.SAFE_SITE_CONFIG || DEFAULT_SITE_CONFIG;

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

const SEAMEN_MENU_LINKS = SITE_CONFIG.seamenMenuLinks.filter((item) => !isMarTrustLink(item.href));
const FOOTER_LINKS = SITE_CONFIG.footerLinks.filter((item) => !isMarTrustLink(item.href));

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
    list.innerHTML = FOOTER_LINKS
      .map((item) => `<li><a href="${toCleanPath(item.href)}">${item.label}</a></li>`)
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

const normalizeContactTriggers = () => {
  document.querySelectorAll('a[href="#contactform"]').forEach((link) => {
    link.setAttribute('data-open-contact-modal', '');
  });
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

  const { title, telegramAccount, telegramGroup, vkGroup, email } = SITE_CONFIG.contactModal;
  modal.innerHTML = `
    <button class="contact-modal__backdrop" type="button" aria-label="Закрыть" data-contact-modal-close></button>
    <div class="contact-modal__dialog" role="document">
      <button class="contact-modal__close" type="button" aria-label="Закрыть" data-contact-modal-close>
        <span aria-hidden="true">&times;</span>
      </button>
      <h2 class="contact-modal__title" id="contact-modal-title">${title}</h2>
      <div class="contact-modal__content">
        <p>
          Наш официальный Телеграмм-аккаунт для переводов:
          <a href="${telegramAccount.href}" target="_blank" rel="noopener noreferrer">${telegramAccount.label}</a>
        </p>
        <p>
          Официальная группа в Телеграмм:
          <a href="${telegramGroup.href}" target="_blank" rel="noopener noreferrer">${telegramGroup.label}</a>
        </p>
        <p>
          Официальная группа Вконтакте:
          <a href="${vkGroup.href}" target="_blank" rel="noopener noreferrer">${vkGroup.label}</a>
        </p>
        <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
      </div>
    </div>`;

  return modal;
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

  const openContactModal = () => {
    contactModal.classList.add('is-open');
    contactModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    if (modalCloseButton) {
      modalCloseButton.focus();
    }
  };

  const closeContactModal = () => {
    contactModal.classList.remove('is-open');
    contactModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
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

  return { closeContactModal, contactModal };
};

renderSeamenSubmenu();
syncMainNavActiveLink();
renderFooter();
sanitizeMarTrustLinksInMenu();
rewriteInternalHtmlLinks();
normalizeContactTriggers();

const navState = initNavigation();
const modalState = initContactModal();

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
