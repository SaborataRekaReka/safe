(function () {
  'use strict';

  var OPERATOR_USERNAMES = ['danil_berdykin'];
  var REDIRECT_DELAY_SECONDS = 5;
  var REDIRECT_DELAY_MS = REDIRECT_DELAY_SECONDS * 1000;
  var TIMER_RING_LENGTH = 314.1592653589793;
  var FALLBACK_BOT_LINK =
    'https://r.bothelp.io/tg?domain=safe_exchange_money_bot&start=c1774877924856-ds';

  var state = {
    modal: null,
    timerNode: null,
    timerValueNode: null,
    timerProgressNode: null,
    countdownNode: null,
    timerId: null,
    redirectTimeoutId: null,
    redirectUrl: FALLBACK_BOT_LINK,
    secondsLeft: REDIRECT_DELAY_SECONDS
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

  function isContactFormHref(rawHref) {
    if (!rawHref) {
      return false;
    }

    if (rawHref === '#contactform') {
      return true;
    }

    try {
      var parsedUrl = new URL(rawHref, window.location.origin);
      return parsedUrl.origin === window.location.origin && parsedUrl.hash === '#contactform';
    } catch (_error) {
      return false;
    }
  }

  function isContactActionText(textValue) {
    if (!textValue) {
      return false;
    }

    var normalized = String(textValue).trim().toLowerCase();
    if (!normalized) {
      return false;
    }

    return (
      normalized.indexOf('написать оператору') >= 0 ||
      normalized.indexOf('связаться с оператором') >= 0 ||
      normalized.indexOf('связаться с нами') >= 0
    );
  }

  function shouldForceBotLink(link, rawHref) {
    if (!link) {
      return false;
    }

    if (isOperatorChatHref(rawHref)) {
      return true;
    }

    if (link.hasAttribute('data-open-contact-modal') || isContactFormHref(rawHref)) {
      return true;
    }

    if (isContactActionText(link.textContent || '')) {
      return true;
    }

    return false;
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
      if (!shouldForceBotLink(link, href)) {
        continue;
      }

      if (link.getAttribute('href') !== botLink) {
        link.setAttribute('href', botLink);
      }

      if (link.hasAttribute('data-open-contact-modal')) {
        link.removeAttribute('data-open-contact-modal');
      }

      link.setAttribute('data-bot-redirect-trigger', 'true');
      link.setAttribute('rel', 'noopener noreferrer');
    }
  }

  function clearCountdownTimer() {
    if (!state.timerId) {
      // no-op
    } else {
      window.clearInterval(state.timerId);
      state.timerId = null;
    }

    if (state.redirectTimeoutId) {
      window.clearTimeout(state.redirectTimeoutId);
      state.redirectTimeoutId = null;
    }
  }

  function renderTimerProgress(remainingMs) {
    if (!state.timerProgressNode || !state.timerValueNode) {
      return;
    }

    var safeRemaining = Math.max(0, Math.min(REDIRECT_DELAY_MS, remainingMs));
    var progress = 1 - safeRemaining / REDIRECT_DELAY_MS;
    var dashOffset = TIMER_RING_LENGTH * progress;

    state.timerProgressNode.style.strokeDasharray = String(TIMER_RING_LENGTH);
    state.timerProgressNode.style.strokeDashoffset = String(dashOffset);

    var secondsValue = Math.max(0, Math.ceil(safeRemaining / 1000));
    if (secondsValue !== state.secondsLeft) {
      state.secondsLeft = secondsValue;
    }

    state.timerValueNode.textContent = String(state.secondsLeft);
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

    state.secondsLeft = REDIRECT_DELAY_SECONDS;
    renderTimerProgress(REDIRECT_DELAY_MS);
    applyCountdownText();

    var deadline = Date.now() + REDIRECT_DELAY_MS;

    if (state.timerNode) {
      state.timerNode.classList.remove('is-running');
      void state.timerNode.offsetWidth;
      state.timerNode.classList.add('is-running');
    }

    state.redirectTimeoutId = window.setTimeout(function () {
      clearCountdownTimer();
      window.location.assign(state.redirectUrl);
    }, REDIRECT_DELAY_MS);

    state.timerId = window.setInterval(function () {
      var remainingMs = Math.max(0, deadline - Date.now());
      renderTimerProgress(remainingMs);
      applyCountdownText();

      if (remainingMs <= 0) {
        clearCountdownTimer();
        return;
      }
    }, 100);
  }

  function createModal() {
    var modal = document.createElement('div');
    modal.id = 'bot-redirect-modal';
    modal.className = 'contact-modal bot-redirect-modal';
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
      '    <div class="bot-redirect-timer" data-bot-redirect-timer style="position:relative;width:146px;height:146px;margin:4px auto 8px;display:grid;place-items:center;">' +
      '      <svg class="bot-redirect-timer__svg" viewBox="0 0 120 120" role="presentation" aria-hidden="true" style="width:146px;height:146px;transform:rotate(-90deg);">' +
      '        <circle class="bot-redirect-timer__track" cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.24)" stroke-width="7"></circle>' +
      '        <circle class="bot-redirect-timer__progress" cx="60" cy="60" r="50" fill="none" stroke="#61c0be" stroke-width="7" stroke-linecap="round" data-bot-redirect-ring></circle>' +
      '      </svg>' +
      '      <div class="bot-redirect-timer__value" data-bot-redirect-seconds style="position:absolute;inset:0;display:grid;place-items:center;font-size:44px;font-weight:700;line-height:1;color:#fff;text-shadow:0 6px 24px rgba(0,5,33,.7);">5</div>' +
      '    </div>' +
      '    <p data-bot-redirect-countdown></p>' +
      '    <p>Если переход не сработает автоматически, используйте кнопку ниже.</p>' +
      '    <p><a class="bot-redirect-now-link" href="#" data-bot-redirect-now>Перейти в Telegram сейчас</a></p>' +
      '  </div>' +
      '</div>';

    document.body.appendChild(modal);

    state.modal = modal;
    state.timerNode = modal.querySelector('[data-bot-redirect-timer]');
    state.timerValueNode = modal.querySelector('[data-bot-redirect-seconds]');
    state.timerProgressNode = modal.querySelector('[data-bot-redirect-ring]');
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

    var linkHref = link.getAttribute('href') || '';
    var shouldHandle =
      link.getAttribute('data-bot-redirect-trigger') === 'true' ||
      shouldForceBotLink(link, linkHref);

    if (!shouldHandle) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }

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
    document.addEventListener('click', onDocumentClick, true);
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
