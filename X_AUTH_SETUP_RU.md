# Настройка X‑авторизации для ZKBEARS

GitHub Pages публикует только статические файлы и не может безопасно обменивать OAuth‑код на токен X. Поэтому папка `worker` содержит отдельный серверный модуль для `api.zkbears.xyz`. Сайт уже настроен на этот адрес.

## 1. Настройки приложения X

В X Developer Console откройте `Apps`, выберите текущее приложение и откройте его настройки.

- App name: `zkBEARS`
- App type: `Web App, Automated App or Bot`
- Website URL: `https://zkbears.xyz`
- Callback URI / Redirect URL: `https://api.zkbears.xyz/oauth/callback`

Адрес callback должен совпадать посимвольно. Старый callback `https://zkbears.xyz/` после перехода на Worker можно удалить.

Строка `2102148846281162752zk_bears` на экране разрешений — это имя приложения X, а не текст сайта. После сохранения App name экран должен показывать `zkBEARS wants to access…`. Аккаунт `@zk_bears` и OAuth‑приложение — разные сущности. Аватар профиля `@zk_bears` нельзя подставить кодом сайта. Если в настройках приложения X доступна загрузка App icon/logo, загрузите логотип там; если такого поля нет, X покажет стандартную иконку приложения.

## 2. Развёртывание Worker

Создайте Cloudflare Worker и подключите к нему custom domain `api.zkbears.xyz`. Затем из папки `worker` установите Wrangler и войдите в Cloudflare:

```powershell
npm install
npx wrangler login
```

Добавьте два секрета:

```powershell
npx wrangler secret put X_CLIENT_ID
npx wrangler secret put SESSION_SECRET
```

Для `X_CLIENT_ID` вставьте Client ID из X Developer Console. Для `SESSION_SECRET` используйте случайную строку длиной не меньше 32 символов. Секрет нельзя добавлять в Git.

В `worker/wrangler.toml` укажите числовой ID поста‑анонса в `TARGET_POST_ID`. Например, для ссылки `https://x.com/zk_bears/status/1234567890` ID равен `1234567890`.

Разверните Worker:

```powershell
npx wrangler deploy
```

После развёртывания адрес `https://api.zkbears.xyz/health` должен отвечать JSON с `"ok": true`. Только после этого публикуйте обновлённые статические файлы сайта.

## 3. Что проверяет сервер

- OAuth 2.0 Authorization Code с PKCE;
- срок и целостность параметра `state`;
- подключённый аккаунт через `/2/users/me`;
- подписку подключённого аккаунта на `@zk_bears` с пагинацией;
- like и quote указанного поста;
- разрешённый origin `https://zkbears.xyz`;
- X‑токен хранится только внутри зашифрованной HttpOnly cookie.
