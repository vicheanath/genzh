# OAuth sign-in (Google & Discord)

How to turn on OAuth for a deployed instance, and what the code actually does
with it. Written against the live deployment at `https://genzh.pdfpaperkit.com`.

## Why this matters right now

With `ALLOW_PASSWORD_SIGNUP=false` and no OAuth configured, **nobody can create
an account**. Existing users can still log in; there is simply no registration
path. Check the current state at any time:

```bash
curl -s https://genzh.pdfpaperkit.com/api/v1/auth/config
```

```json
{"app_env":"production","allow_password_signup":false,
 "oauth_providers":{"google":false,"discord":false}}
```

Both flags flip to `true` on their own once credentials are present — the API
reports a provider as configured when its client ID is set
(`apps/api/src/oauth/google.rs`), so this endpoint is the ground truth for
whether setup worked. No restart-and-hope required.

---

## The redirect URIs

These are the only values the provider consoles genuinely need from you, and
getting them wrong is the single most common failure:

| Provider | Redirect URI |
|---|---|
| Google | `https://genzh.pdfpaperkit.com/api/v1/auth/oauth/google/callback` |
| Discord | `https://genzh.pdfpaperkit.com/api/v1/auth/oauth/discord/callback` |

They must match **byte for byte** — scheme, host, path, no trailing slash.

You do **not** need to set `GOOGLE_REDIRECT_URI` or `DISCORD_REDIRECT_URI` in
`.env`. When unset, `default_redirect_uri()` in `apps/api/src/oauth/mod.rs`
builds exactly the URIs above from `FRONTEND_URL`. Set them explicitly only if
the callback must differ from `FRONTEND_URL` — for example, when the API is on
a different origin from the web app. Setting them by hand to something that
disagrees with `FRONTEND_URL` is a reliable way to break the flow.

---

## Google

1. Open the [Google Cloud Console](https://console.cloud.google.com/), and
   select or create a project.
2. **APIs & Services → OAuth consent screen.** Choose **External**, fill in the
   app name, your support email, and the developer contact. You do not need to
   enable any additional API — the flow uses only the standard OpenID endpoints.
3. While the app is in **Testing**, only accounts listed under **Test users**
   can sign in. Add your own address there, or **Publish** the app. A published
   app requesting only `email`/`profile`/`openid` does not need Google's
   verification review — those are non-sensitive scopes.
4. **Credentials → Create Credentials → OAuth client ID.**
   - Application type: **Web application**
   - Authorized redirect URI: the Google row from the table above
   - Authorized JavaScript origins: not required; the flow is a server-side
     redirect, not a browser-side token grant.
5. Copy the **Client ID** and **Client secret**.

The scopes are fixed in code, not configuration — `openid email profile`, with
`access_type=online` (`apps/api/src/oauth/google.rs`). Online access means no
refresh token is requested: sessions are this app's own JWTs, so there is
nothing to refresh against Google, and asking for offline access would request
a credential the app would never use.

## Discord

1. Open the [Discord Developer Portal](https://discord.com/developers/applications)
   and click **New Application**.
2. **OAuth2 → Redirects → Add Redirect**, and paste the Discord row above.
3. Copy the **Client ID**, then **Reset Secret** to reveal a **Client Secret**.

Scopes are `identify email` (`apps/api/src/oauth/discord.rs`). Discord will not
return an email address without the `email` scope, and the app treats a missing
email as a failed sign-in — so do not trim it.

You do not need to add a bot, a redirect for `localhost`, or any Gateway
intents. This is a plain OAuth2 authorization-code app.

---

## Applying the credentials

On the server, add the four values to `/opt/genzh/.env`:

```ini
GOOGLE_CLIENT_ID=<google client id>
GOOGLE_CLIENT_SECRET=<google client secret>
DISCORD_CLIENT_ID=<discord client id>
DISCORD_CLIENT_SECRET=<discord client secret>
```

Leave `GOOGLE_REDIRECT_URI` and `DISCORD_REDIRECT_URI` empty, per the section
above. Then restart just the API:

```bash
cd /opt/genzh && docker compose -f docker-compose.prod.yml up -d api
```

Configuring one provider without the other is fine — each is reported
independently, and the web UI offers only the buttons whose provider is on.

---

## Verifying

```bash
curl -s https://genzh.pdfpaperkit.com/api/v1/auth/config
```

`google` and `discord` should now read `true`. Then check the redirect is
actually formed — this should return a `302` whose `location` points at the
provider:

```bash
curl -s -o /dev/null -D - https://genzh.pdfpaperkit.com/api/v1/auth/oauth/google/authorize | grep -i '^location'
```

Finally, sign in through the browser. That is the only step that exercises the
callback, the token exchange and the profile fetch together.

---

## How the flow works

```
browser                    API                         provider
───────                    ───                         ────────
GET /auth/oauth/google/authorize
                     ──▶ mint CSRF state, 302 ─────▶ consent screen
                                                          │
                     ◀── GET .../callback?code&state ─────┘
                     verify state
                     POST token_endpoint  ─────────▶ exchange code
                     GET  userinfo_endpoint ───────▶ fetch profile
                     upsert user, mint session JWT
                     302 back to FRONTEND_URL
```

Three details worth knowing:

- **`state` is a CSRF token the API mints and verifies.** A callback arriving
  with a state the API did not issue is rejected, which is what stops an
  attacker from replaying a callback into your session.
- **The provider's token is used once and discarded.** It fetches the profile,
  and then the app issues its own JWT. Nothing provider-issued is stored, which
  is why revoking access at Google does not log an existing user out.
- **Providers are looked up by key, not hardcoded in the handlers.**
  `apps/api/src/routes/oauth.rs` never names a provider; adding a third means
  adding a module under `apps/api/src/oauth/` and one field to
  `OAuthProvidersConfig`. That field is deliberate — the JSON shape is a
  published contract and cannot silently become an array.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `redirect_uri_mismatch` | the console URI differs from `FRONTEND_URL` + `/api/v1/auth/oauth/<p>/callback` — compare them character by character |
| provider still `false` after restart | client ID missing or empty; the API reads it at startup only |
| Google: "app is blocked" / access denied | app is in Testing and the account is not a listed test user |
| Discord: sign-in fails with no email | the `email` scope was removed from the app's redirect config |
| callback returns 400 on `state` | cookies blocked, or the callback was reached on a different origin than it started |
| works on LAN, fails publicly | `FRONTEND_URL` still points at the LAN IP — it must be the HTTPS hostname |
