# Новая настройка Join Whitelist

Старая OAuth-конфигурация и старый Client ID удалены. Новая система состоит из статического сайта на GitHub Pages и отдельного Cloudflare Worker с базой D1.

## 1. Создать новое приложение X

В X Developer Console создайте новое приложение внутри проекта.

Настройки User authentication:

- App permissions: `Read`
- Type of App: `Web App, Automated App or Bot`
- Callback URI / Redirect URL: `https://api.zkbears.xyz/auth/x/callback`
- Website URL: `https://zkbears.xyz`
- App name: `zkBEARS`

Сохраните новый **OAuth 2.0 Client ID** и **Client Secret**. Client Secret нельзя отправлять в чат или добавлять в Git.

Имя на странице разрешений X берётся из App name. Поэтому после настройки там должно быть `zkBEARS wants to access…`. Профиль `@zk_bears` и OAuth-приложение являются разными объектами. Аватар профиля нельзя подставить кодом сайта; если X Developer Console предлагает поле App icon/logo, изображение нужно загрузить именно туда.

## 2. Создать API и базу Cloudflare

Откройте терминал в папке:

```powershell
cd D:\zkbears-publish\whitelist-api
npm install
npx wrangler login
```

Создайте новую D1-базу:

```powershell
npx wrangler d1 create zkbears-whitelist
```

Скопируйте полученный `database_id` в `whitelist-api/wrangler.toml`, заменив `REPLACE_WITH_NEW_D1_DATABASE_ID`.

Примените схему:

```powershell
npx wrangler d1 execute zkbears-whitelist --remote --file schema.sql
```

Добавьте секреты. Wrangler запросит каждое значение отдельно и не сохранит его в Git:

```powershell
npx wrangler secret put X_CLIENT_ID
npx wrangler secret put X_CLIENT_SECRET
npx wrangler secret put TOKEN_ENCRYPTION_KEY
```

`TOKEN_ENCRYPTION_KEY` должна быть новой случайной строкой длиной не меньше 32 символов.

## 3. Добавить пост для задания Like + Quote

В `whitelist-api/wrangler.toml` замените `REPLACE_WITH_ANNOUNCEMENT_POST_ID` на числовую часть ссылки поста.

Например, для:

```text
https://x.com/zk_bears/status/1234567890
```

нужно указать:

```toml
TARGET_POST_ID = "1234567890"
```

## 4. Развернуть API

```powershell
npx wrangler deploy
```

В Cloudflare подключите к Worker custom domain `api.zkbears.xyz`. После этого проверьте:

```text
https://api.zkbears.xyz/health
```

Ответ должен быть `{"ok":true}`.

## 5. Опубликовать сайт

Только после успешной проверки API отправьте изменения сайта в GitHub:

```powershell
cd D:\zkbears-publish
git push origin main
```

## Что теперь хранится на сервере

- X user ID, username, имя и avatar URL;
- зашифрованные OAuth-токены;
- подтверждение Follow;
- подтверждение Like + Quote;
- Zcash Unified Address;
- дата финальной отправки whitelist.

В базе действуют ограничения: один X user ID создаёт одну запись, а один Zcash-кошелёк нельзя использовать в двух разных записях.
