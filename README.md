# SAFE Website

Статический сайт SAFE с чистыми URL, автономной версткой и клиентской логикой для передачи партнерского кода в Telegram-бота через BotHelp.

## Что реализовано

- Многостраничный сайт на HTML/CSS/JS без сборщика.
- Чистые URL через Apache rewrite (например, /seamen вместо /seamen.html).
- Единая клиентская логика навигации, меню и контактной модалки.
- Партнерский трекинг: чтение partner_code и a_aid из URL, сохранение в localStorage и cookie, подстановка в BotHelp-ссылки.
- Отдельный маршрут /go-bot для партнерских переходов в Telegram-бота.
- Тестовый маршрут /test-bot с принудительным переводом контактных CTA в бота через модалку-редирект.

## Технологии

- HTML5
- CSS3
- Vanilla JavaScript (без фреймворков)
- Apache .htaccess rewrite rules
- Node.js built-in test runner для unit-тестов

## Структура проекта

- index.html, seamen.html, shipmoney.html, kadmos.html, company.html, transfers.html, business.html, martrust.html: основные страницы
- go-bot.html: партнерский маршрут для перехода в бота
- test-bot.html: тестовая страница для проверки сценариев перехода в бота
- styles.css: общие стили
- script.js: общая логика UI и навигации
- site.config.js: конфиг сайта и партнерской логики
- partner-tracking.js: глобальная логика partner_code и BotHelp-ссылок
- test-bot-page.js: логика тестовой модалки редиректа в бота
- robots.txt, sitemap.xml, .htaccess: SEO и маршрутизация
- tests/partner-tracking.test.js: unit-тесты partner-трекинга

## Маршруты

Основные публичные:

- /
- /seamen
- /shipmoney
- /kadmos
- /company
- /transfers
- /business

Специальные:

- /go-bot: партнерский переход в Telegram-бота через BotHelp
- /test-bot: тестовый сценарий CTA -> модалка -> редирект в бота

Исключены из индексации:

- /martrust
- /test-bot

## Локальный запуск

Проект статический, можно запустить любым простым HTTP-сервером.

Вариант 1 (Python):

1. Перейдите в корень проекта.
2. Выполните команду: python -m http.server 8080
3. Откройте: http://localhost:8080

Вариант 2 (Node):

1. Установите любой статический сервер (например, serve).
2. Запустите сервер в корне проекта.

Важно: для корректной проверки rewrite-правил нужна Apache-конфигурация с .htaccess.

## Конфигурация

Главный конфиг находится в site.config.js.

### SAFE_SITE_CONFIG

- seamenMenuLinks: пункты подменю для раздела моряков
- footerLinks: пункты футера
- contactModal: содержимое контактной модалки
- leadForm.endpointUrl: серверный endpoint для отправки заявок (по умолчанию /lead-submit.php)

## Безопасная отправка заявок в Telegram

Отправка заявок выполняется через серверный endpoint `lead-submit.php`.

Важно:

- Telegram token и chat id не должны храниться в `site.config.js`.
- На сервере используется файл `.lead-secrets.php` (не в git) или переменные окружения `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID`.
- В репозитории есть шаблон `lead-secrets.example.php`.

Для автоматической настройки при деплое через GitHub Actions добавьте Repository Secrets:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

### SAFE_PARTNER_CONFIG

- PARTNER_QUERY_KEYS: ключи query-параметров для поиска партнерского кода
- STORAGE_KEY: ключ localStorage
- COOKIE_KEY: ключ cookie
- COOKIE_MAX_AGE_DAYS: срок жизни cookie
- BOTHELP_URL_PREFIX: префикс BotHelp redirect URL
- DEFAULT_BOTHELP_LINK: базовая ссылка на бота через BotHelp
- AUTO_REDIRECT_TO_BOT: включение автоперехода на /go-bot
- MAX_PARTNER_CODE_LENGTH: ограничение длины partner_code
- AUTO_REDIRECT_DELAY_MS: задержка автоперехода на /go-bot

## Как работает partner-tracking

Файл: partner-tracking.js

### Цель

Передавать partner_code из партнерской ссылки в карточку подписчика BotHelp при переходе в Telegram-бота.

### Приоритет источников partner_code

1. partner_code из URL
2. a_aid из URL (нормализуется в partner_code)
3. localStorage
4. cookie

### Поток обработки

1. Чтение query-параметров через URLSearchParams.
2. Валидация значения:
   - trim()
   - пустые значения отбрасываются
   - ограничение длины
3. Сохранение валидного значения:
   - localStorage
   - cookie (path=/, SameSite=Lax, 30 дней, Secure на HTTPS)
4. Поиск на странице всех ссылок с префиксом BotHelp redirect.
5. Добавление или замена partner_code в URL, без потери остальных параметров (domain, start, utm и т.д.).

### SPA и динамический DOM

Логика повторно применяет декорирование ссылок:

- при DOMContentLoaded
- при изменениях DOM (MutationObserver)
- при client-side навигации (patch pushState/replaceState + popstate/hashchange)

### /go-bot

На странице go-bot:

- определяется актуальный partner_code по тем же правилам
- строится итоговая BotHelp-ссылка
- обновляется fallback-кнопка ручного перехода
- при включенном флаге AUTO_REDIRECT_TO_BOT выполняется автопереход

## Тестовая страница /test-bot

Файл: test-bot-page.js

Назначение:

- тестировать переходы в бота без изменения боевых страниц
- перехватывать CTA типа Связаться с нами, Написать оператору, ссылки на #contactform и прямые ссылки оператора
- показывать модалку с таймером и делать редирект в BotHelp-ссылку

Текущая задержка автоперехода: 5 секунд.

## Unit-тесты

Файл тестов: tests/partner-tracking.test.js

Покрываются сценарии:

- чтение partner_code и a_aid из query
- приоритет источников partner_code
- корректная сборка BotHelp URL
- замена существующего partner_code
- отсутствие изменений для не-BotHelp URL

Запуск:

- node --test .\\tests\\partner-tracking.test.js

## SEO и индексация

- robots.txt содержит запреты для служебных маршрутов.
- sitemap.xml содержит публичные страницы.
- test-bot.html дополнительно содержит meta robots noindex.

## Примечания по эксплуатации

- Если после обновлений виден старый UI/JS, проверьте query-версии ассетов и выполните hard reload.
- Для партнерского трафика используйте ссылки на сайт (например, /go-bot?a_aid=...), а не прямые ссылки t.me.
- Не перезаписывайте partner_code в BotHelp шагом со значением {{start}}, иначе будет затирание данных.

## Лицензия

Проект приватный, использование и распространение по внутренним правилам команды.
