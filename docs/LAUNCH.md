# Kleos: launch guide (data, revenue, store)

The app code is ready. These are the accounts and settings only you can create. Do them in this order; most steps take minutes, Apple's reviews take days.

## 0. Before anything
- **Rotate every key** that was ever pasted in chat (Anthropic, Deepgram, ElevenLabs) and set monthly spend limits in each dashboard.
- **Trademark check** on "Kleos" (USPTO TESS, class 9 and 41) and search the App Store. If "Kleos" is taken as an app name, list it as **Kleos: Aura Coach**.
- Decide **Individual vs Company** for the Apple account. A company (LLC + free D-U-N-S number, about 1–2 weeks) shows "Kleos" as the seller.

## 1. Host the server (Railway, about 20 min, about $5–20/month)
1. railway.com → New Project → Deploy from GitHub → `avarice-apps/aura-app`. It finds `railway.json` and the root `Dockerfile`.
2. **Variables** (Service → Variables):
   - `ANTHROPIC_API_KEY`
   - `DEEPGRAM_API_KEY`
   - `ELEVENLABS_API_KEY`
   - `POISE_VOICE_ID` = `6RhsStUwC1J5DEn4TbMO`
   - `AURA_ADMIN_KEY` = any long random string
   - `KLEOS_CONTACT_EMAIL` = your support email
   - `KLEOS_COMPANY` = your legal name or LLC
   - `AURA_TRAIN_DIR` = `/app/server/data/training`
3. **Volume**: Service → Settings → Volumes → mount at `/app/server/data`. It keeps duels, situation stats and the live agent id across deploys.
4. **Settings → Networking → Generate Domain.** Copy the https URL and add it as a variable: `AURA_PUBLIC_URL=https://…up.railway.app`. Redeploy.
5. Check the deploy:
   - `https://…/health` returns ok.
   - `https://…/privacy` and `https://…/terms` load. These are your App Store privacy and terms URLs.
   - The deploy log prints no "live agent setup failed".

## 2. Apple (developer.apple.com + App Store Connect)
1. Enrol in the Apple Developer Program ($99/yr).
2. App Store Connect → **Agreements, Tax, and Banking** → accept the **Paid Apps** agreement and add bank and tax details. Subscriptions don't work in testing until this is active.
3. **My Apps → + New App**:
   - iOS
   - name **Kleos** (or the fallback)
   - bundle ID **com.avarice.kleos** (register it under Certificates, Identifiers & Profiles if it's not listed)
   - SKU `kleos-ios`
4. **Subscriptions** → create one group, "Kleos", with these four products. Prices are the launch hypothesis; change them freely later.

   | Product ID | Name | Duration | Price | Intro offer |
   |---|---|---|---|---|
   | `kleos_plus_weekly` | Kleos+ Weekly | 1 week | $6.99 | Free trial, 3 days, new subscribers |
   | `kleos_plus_annual` | Kleos+ Yearly | 1 year | $49.99 | none (or a 7-day trial to test) |
   | `kleos_black_monthly` | Kleos Black Monthly | 1 month | $19.99 | none |
   | `kleos_black_annual` | Kleos Black Yearly | 1 year | $129.99 | none |

   - Within the group, rank Black above Plus, so moving from Plus to Black is an upgrade.
   - Each product needs a display name, a description and a review screenshot. Use a screenshot of the paywall.
5. **App Store Connect → Users and Access → Integrations → In-App Purchase** → generate a key (.p8). You'll upload it to RevenueCat.

## 3. RevenueCat (payments, about 20 min, free until $2.5k/month in revenue)
1. app.revenuecat.com → New project "Kleos" → add an **App Store** app with bundle ID `com.avarice.kleos`. Upload the In-App Purchase key (.p8), its Key ID and the Issuer ID.
2. **Products** → import the four products.
3. **Entitlements**:
   - `plus`, attached to `kleos_plus_weekly` and `kleos_plus_annual`
   - `black`, attached to `kleos_black_monthly` and `kleos_black_annual`

   The app treats Black as including everything in Plus.
4. **Offerings** → the `default` offering, marked Current, with all four products as packages.
5. Copy the **public iOS SDK key** (`appl_…`) into `eas.json` as `EXPO_PUBLIC_RC_IOS_KEY`.
6. Optional but worth it: Integrations → PostHog, so revenue events land in your analytics.
7. Sandbox testing:
   - On your iPhone, go to Settings → Developer → Sandbox Apple Account and sign in with a sandbox tester (App Store Connect → Users → Sandbox).
   - Buy in a TestFlight build; nothing is charged.

## 4. PostHog (analytics, 10 min, free tier)
1. posthog.com → create a project (US or EU). Copy the **project API key** (`phc_…`) and the host.
2. Put them in `eas.json`: `EXPO_PUBLIC_POSTHOG_KEY` and `EXPO_PUBLIC_POSTHOG_HOST`.
3. Events the app already sends:
   - `onboarding_complete`
   - `paywall_view` {reason}
   - `purchase_started`, `purchase_completed`, `purchase_cancelled`
   - `call_finished` {kind, rating, effort}
   - `call_failed`
   - `clip_rated`
   - `profile_read`
   - `duel_created`, `duel_judged`
   - `rehearse_built`
   - `portrait_made`
   - `share` {what}
   - plus screen views and app lifecycle
4. Build these first:
   - **Funnel:** app installed → onboarding_complete → paywall_view → purchase_completed
   - **Retention:** call_finished, D1/D7/D30
   - **Breakdown** of paywall_view by reason, which shows which wall converts

## 5. Build and ship (Expo EAS)
```bash
cd ~/aura-app
npx eas-cli@latest login            # create a free expo.dev account if needed
npx eas-cli@latest init             # links the project; commit the projectId it adds to app.json
```
1. Edit `eas.json`. Replace every `REPLACE`:
   - the Railway URL, in all three profiles
   - `appl_…` and `phc_…`
   - `ascAppId` (App Store Connect → your app → App Information → Apple ID)
2. Build and submit:
   ```bash
   npx eas-cli@latest build -p ios --profile production    # cloud build, about 20 min, no Xcode needed
   npx eas-cli@latest submit -p ios --latest                # uploads to App Store Connect / TestFlight
   ```
3. TestFlight → add yourself and about 20 friends → test:
   - a live call
   - a duel between two phones
   - a sandbox purchase
   - Restore
   - Delete everything
4. For your local dev build with the new bundle id, run `npm run build` again. It regenerates the iOS project by itself. The old "Aura" app on your phone can be deleted.

## 6. App Store listing
- **Subtitle:** "Honest reads on how you come across"
- **Category:** Lifestyle (secondary: Education)
- **Age rating:** 17+. Frequent: profanity and crude humour. Infrequent: mature or suggestive themes.
- **App Privacy (nutrition label):**
  - Data collected:
    - Audio Data
    - Photos or Videos
    - Other User Content (transcripts)
    - Product Interaction
    - Purchase History
    - User ID (random install id)
  - None is linked to identity, none is used for tracking, and app functionality and analytics are the purposes.
- **Privacy Policy URL:** `https://YOUR-SERVER/privacy`
- **Terms:** add `Terms of Use: https://YOUR-SERVER/terms` at the end of the description, or set a custom EULA.
- **Review notes:**
  - No login.
  - Live calls need the microphone. Try Today → Daily Side Quest.
  - Duels need two phones or "pass the phone".
  - Subscriptions are in Progress → You → Plan.
  - Characters in Unfiltered mode swear (18+ toggle).
- **Screenshots:** 6.9" and 6.5". Use the Hermes-blue screens: Daily Side Quest, a brutal read, the Duel verdict, Profile Read, the Paywall.

## 7. Running costs to watch
- **ElevenLabs Agents** is the big one: about $0.08 per live minute plus your plan's included minutes. Calls are open-ended now, so set the plan's overage limit.
- **Anthropic:** cents per call (Haiku for characters, Sonnet for reads). **Deepgram:** fractions of a cent per minute.
- At $6.99/week, a Plus user stays very profitable below about 2 hours of live calls a week. Watch PostHog `call_finished` volume per paying user for the first month.

## The tiers (what the app enforces)
| | Free | Kleos+ | Kleos Black |
|---|---|---|---|
| Daily Side Quest | every day | every day | every day |
| Aura Farm, Debate Duels | unlimited | unlimited | unlimited |
| Live calls (Open Floor, side quests, Path) | 2 / week | unlimited | unlimited |
| The read | verdict, score, Poise's voice note | + the moment, turning point, their thoughts, two ways in | same |
| Run it back / Replay | — | yes | yes |
| Rate a Clip | 1 / week | unlimited | unlimited |
| Poise debriefs | 3 / week | unlimited | unlimited |
| Profile Read | 1 / week | 3 / week | unlimited |
| Patterns and cleared tells | count only | full, with quotes | full |
| Rehearse your real situation | — | — | yes |
| Your Portrait | — | — | yes |
