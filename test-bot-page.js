(function () {
  'use strict';

  var OPERATOR_USERNAMES = ['danil_berdykin'];
  var FALLBACK_BOT_LINK =
    'https://r.bothelp.io/tg?domain=safe_exchange_money_bot&start=c1774877924856-ds';

  var state = {
    modal: null,
    countdownNode: null,
    timerId: null,
    redirectUrl: FALLBACK_BOT_LINK,
    secondsLeft: 3
  };

  function normalizeTelegramUsername(pathname) {
    if (!pathname) {
      return '';
    }

    return String(pathname).replace(/^\/+/, '').replace(/^@/, '').toLowerCase();
  }

  function isOperatorChatHref(rawHref) {
    if (!rawHref) {
      return false;
    }

    var parsedUrl;
    try {
      parsedUrl = new URL(rawHref, window.location.origin);
    } catch (_error) {
      return false;
    }

    if (parsedUrl.hostname.toLowerCase() !== 't.me') {
      return false;
    }

    var username = normalizeTelegramUsername(parsedUrl.pathname);
    return OPERATOR_USERNAMES.indexOf(username) >= 0;
  }

  function resolveBotLink() {
    var tracker = window.SafePartnerTracking;
    if (!tracker) {
      return FALLBACK_BOT_LINK;
    }

    try {
      var partnerCode =
        typeof tracker.resolvePartnerCode === 'function' ? tracker.resolvePartnerCode() : null;

      if (typeof tracker.buildBotHelpLink === 'function') {
        return tracker.buildBotHelpLink(partnerCode);
      }
    } catch (_error) {
      return FALLBACK_BOT_LINK;
    }

    return FALLBACK_BOT_LINK;
  }

  function updateOperatorLinks(root) {
    var scope = root || document;
    var botLink = resolveBotLink();
    var links = typeof scope.querySelectorAll === 'function' ? scope.querySelectorAll('a[href]') : [];

    for (var i = 0; i < links.length; i += 1) {
      var link = links[i];
      var href = link.getAttribute('href') || '';
      if (!isOperatorChatHref(href)) {
        continue;
      }

      if (link.getAttribute('href') !== botLink) {
        link.setAttribute('href', botLink);
      }

      link.setAttribute('data-bot-redirect-trigger', 'true');
      link.setAttribute('rel', 'noopener noreferrer');
    }
  }

  function clearCountdownTimer() {
    if (!state.timerId) {
      return;
    }

    window.clearInterval(state.timerId);
    state.timerId = null;
  }

  function closeModal() {
    if (!state.modal) {
      return;
    }

    clearCountdownTimer();
    state.modal.classList.remove('is-open');
    state.modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }

  function applyCountdownText() {
    if (!state.countdownNode) {
      return;
    }

    state.countdownNode.textContent =
      'Сейчас будет совершен переход в Telegram-бота. Автопереход через ' +
      state.secondsLeft +
      ' сек.';
  }

  function startCountdown() {
    clearCountdownTimer();

    state.secondsLeft = 3;
    applyCountdownText();

    state.timerId = window.setInterval(function () {
      state.secondsLeft -= 1;

      if (state.secondsLeft <= 0) {
        clearCountdownTimer();
        window.location.assign(state.redirectUrl);
        return;
      }

      applyCountdownText();
    }, 1000);
  }

  function createModal() {
    var modal = document.createElement('div');
    modal.id = 'bot-redirect-modal';
    modal.className = 'contact-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'bot-redirect-title');

    modal.innerHTML =
      '<button class="contact-modal__backdrop" type="button" aria-label="Закрыть" data-bot-redirect-close></button>' +
      '<div class="contact-modal__dialog" role="document">' +
      '  <button class="contact-modal__close" type="button" aria-label="Закрыть" data-bot-redirect-close>' +
      '    <span aria-hidden="true">&times;</span>' +
      '  </button>' +
      '  <h2 class="contact-modal__title" id="bot-redirect-title">Переход в Telegram-бота</h2>' +
      '  <div class="contact-modal__content">' +
      '    <p data-bot-redirect-countdown></p>' +
      '    <p>Если переход не сработает автоматически, используйте кнопку ниже.</p>' +
      '    <p><a href="#" data-bot-redirect-now>Перейти в Telegram сейчас</a></p>' +
      '  </div>' +
      '</div>';

    document.body.appendChild(modal);

    state.modal = modal;
    state.countdownNode = modal.querySelector('[data-bot-redirect-countdown]');

    var closeButtons = modal.querySelectorAll('[data-bot-redirect-close]');
    for (var i = 0; i < closeButtons.length; i += 1) {
      closeButtons[i].addEventListener('click', closeModal);
    }

    var manualLink = modal.querySelector('[data-bot-redirect-now]');
    if (manualLink) {
      manualLink.addEventListener('click', function (event) {
        event.preventDefault();
        window.location.assign(state.redirectUrl);
      });
    }
  }

  function openModal(redirectUrl) {
    if (!state.modal) {
      createModal();
    }

    var contactModal = document.querySelector('#contact-modal.is-open');
    if (contactModal) {
      contactModal.classList.remove('is-open');
      contactModal.setAttribute('aria-hidden', 'true');
    }

    state.redirectUrl = redirectUrl || FALLBACK_BOT_LINK;
    state.modal.classList.add('is-open');
    state.modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    startCountdown();
  }

  function onDocumentClick(event) {
    var link = event.target.closest('a[href], a[data-bot-redirect-trigger]');
    if (!link) {
      return;
    }

    var shouldHandle =
      link.getAttribute('data-bot-redirect-trigger') === 'true' ||
      isOperatorChatHref(link.getAttribute('href') || '');

    if (!shouldHandle) {
      return;
    }

    event.preventDefault();
    updateOperatorLinks(document);
    openModal(resolveBotLink());
  }

  function initMutationObserver() {
    if (typeof MutationObserver !== 'function') {
      return;
    }

    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i += 1) {
        var mutation = mutations[i];

        if (mutation.type !== 'childList' || !mutation.addedNodes || mutation.addedNodes.length === 0) {
          continue;
        }

        for (var j = 0; j < mutation.addedNodes.length; j += 1) {
          var node = mutation.addedNodes[j];
          if (!node || node.nodeType !== 1) {
            continue;
          }

          updateOperatorLinks(node);
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function init() {
    updateOperatorLinks(document);
    createModal();
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        closeModal();
      }
    });
    initMutationObserver();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
