# Setup: accounts, plans and Poise Direct

What has to be configured outside the code for the 17 October build. Nothing here needs a code change.

## 1. Rebuild the app

This build adds two native modules (Sign in with Apple, clipboard). An installed build from before this
change won't have them, and it can't talk to the new server: every request now needs an account token.

Rebuild once (`npm run phone`, or an EAS build). After that, JavaScript-only updates work as before.

## 2. Railway variables

Required to run as before:

| Variable | What it does |
|---|---|
| `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `DEEPGRAM_API_KEY` | As before |
| `AURA_PUBLIC_URL` | As before (the https address of the server) |

New, recommended now:

| Variable | What it does |
|---|---|
| `AURA_ADMIN_KEY` | 16+ random characters. Admin endpoints refuse shorter keys. |
| `KLEOS_SIGNING_KEY` | 32+ random characters. Signs voice links and keys the phone-number hashes for Poise Direct. If unset, a key derived from the Anthropic key is used; set it so rotating that key doesn't sign everyone's links out. |
| `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Sends the 6-digit sign-in codes (Fastmail works: an app password from Fastmail settings). Without these, codes are only written to the server log, so nobody can sign in by email. |
| `APPLE_AUDIENCES` | Defaults to `com.avarice.kleos,host.exp.Exponent`. Only change it if the bundle id changes. |
| `REVENUECAT_WEBHOOK_AUTH` | The Authorization value you set on the RevenueCat webhook. Plans follow purchases through it. |
| `REVENUECAT_SECRET_KEY` | Optional. Lets the server ask RevenueCat directly when a webhook is late. |

Testing only (remove before launch):

| Variable | What it does |
|---|---|
| `KLEOS_DEV_PLANS=1` | Lets phone test builds (no RevenueCat) unlock a plan on the server. Without it, test builds are Free on the server even if the phone shows Black. |

Never set on the live server: `KLEOS_DEV_CODES` (returns sign-in codes in the response; tests only).

## 3. Sign in with Apple

In the Apple Developer portal, enable "Sign in with Apple" on the App ID `com.avarice.kleos`, then rebuild
(the entitlement is already in `app.json`). Nothing to configure on the server.

## 4. Poise Direct (Kleos Black), when you want to pilot it

It's off until `KLEOS_DIRECT_CHANNEL` is set. Pick one channel.

**iMessage (blue bubbles) through Sendblue.** Closest to "text Poise like a friend" on iPhone. Apple has no
public iMessage bot API; Sendblue is a third-party service that isn't affiliated with Apple, so there's some
platform risk. Their AI-agent plan with a dedicated number was listed at about $100 a month; check the current
price. There's a free sandbox.

1. Create a Sendblue account and get a dedicated number.
2. Railway: `KLEOS_DIRECT_CHANNEL=imessage`, `SENDBLUE_KEY_ID`, `SENDBLUE_SECRET`, `SENDBLUE_FROM` (your
   Sendblue number, +1…), and `SENDBLUE_WEBHOOK_TOKEN` (32+ random characters).
3. In Sendblue › Developer › Webhooks, add a `receive` webhook:
   `https://<your server>/direct/sendblue/<SENDBLUE_WEBHOOK_TOKEN>`

**SMS (green bubbles) through Twilio.** Official and cheap per message. US texting from a regular number
needs A2P 10DLC registration first: the sole-proprietor route (no company EIN) was $4 for the brand, $15 for
campaign vetting and $2 a month, limited to under 1,000 messages a day. Approval usually takes under a week.

1. Buy a number in Twilio and complete A2P 10DLC registration (use case: "account notifications / customer
   care, replies only to messages the user sends").
2. Railway: `KLEOS_DIRECT_CHANNEL=sms`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` (the number),
   or `TWILIO_MESSAGING_SERVICE_SID` instead of `TWILIO_FROM`.
3. In Twilio, set the number's "A message comes in" webhook (HTTP POST) to `https://<your server>/direct/twilio`.
   If the server sits behind a different public address, set `KLEOS_DIRECT_WEBHOOK_URL` to exactly the URL
   you entered in Twilio (the signature check depends on it).

Limits you can change: `KLEOS_DIRECT_PER_HOUR` (30), `KLEOS_DIRECT_PER_DAY` (120), `KLEOS_DIRECT_DAILY_CAP`
(3000 across everyone; a hard stop on spend). Each answered message also counts as one Poise read.

To test without sending real texts: `KLEOS_DIRECT_DRY_RUN=1` prints the replies to the server log.

## 5. What runs where

- Accounts, allowances, tribunals and Poise Direct live in SQLite under `server/data` (the Railway volume).
- Progress, chats, draft reads and the wardrobe stay on the phone. The server keeps a short summary for the
  Members page, and only for saved accounts.
