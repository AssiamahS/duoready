# DuoReady

**Live:** https://assiamahs.github.io/duoready/

Paste an App Store link and find out if the app is letterboxed on iPhone Duo's inner display. Then buy a fixed-price refit.

## The problem

iPhone Duo (Apple's first foldable, 5.4" outer / 7.6" near-square inner) shipped on 2026-10-23 with iOS 27.1. Apps only fill the inner display when they're built with the iOS 27.1 SDK (Xcode 27.1). Everything else opens as a phone-sized window with black bars. Starting April 2027, App Store submissions also need Duo screenshots.

Most apps with real users and a small team behind them (transit agencies, logistics and shipping tools, credit unions, union and port apps, local services) won't get to it this quarter. That backlog is the market.

## Buyer

Owners of iOS apps with real users and no full-time iOS developer: small SaaS companies, agencies maintaining client apps, transit and logistics operators, credit unions, and solo founders whose last release came out before 2026-10-05.

## Offer

| Tier | Price | What ships |
| --- | --- | --- |
| Rebuild & verify | $299 | Rebuild on the iOS 27.1 SDK, inner/outer smoke test, Duo screenshots, 3 business days |
| Audit & patch | $599 | Plus size classes instead of orientation, safe areas, sheets, tab bar, and state kept across fold |
| Two-pane refit | $999 | Plus NavigationSplitView or split layout for one key flow, and Split View on iPhone |

The client pays nothing if the app still doesn't fill the inner display.

## How the checker decides

It reads `currentVersionReleaseDate` and `releaseNotes` from Apple's public iTunes lookup API, using CORS fetch with a JSONP fallback.

- **Likely letterboxed:** the last release came out before 2026-10-05, when the App Store started accepting Xcode 27.1 RC builds. A build that old can't use the 27.1 SDK.
- **Rebuilt, not confirmed:** released after that date, but the notes don't mention Duo or folding.
- **Duo update shipped:** released after that date, and the notes mention Duo or folding.

The App Store doesn't publish which SDK an app was built with, so this is an estimate. The `supportedDevices` field lists `iPhoneDuo` for every iPhone app, old ones included, so it tells you nothing. Google Maps updated on 10-23 and was still reported as not adapted.

The **Lead list** tab searches up to 200 apps for a keyword (trucking, transit, port, freight, credit union…), keeps the stale ones, sorts them by rating count, and exports a CSV with the seller website and developer page. **Copy outreach** writes a cold message for the app you're viewing.

## Taking payment (PAY_URL)

Edit `web/config.js`:

```js
window.DUOREADY_CONFIG = {
  PAY_URL: "https://buy.stripe.com/xxxxxxxx",  // Stripe / Square / PayPal payment link
  CONTACT: "you@example.com",                  // or "+15551234567" for SMS
};
```

Commit and push. The `pages` workflow redeploys in about a minute. While `PAY_URL` is empty, every **Start** button opens a request form that drafts an email or SMS to `CONTACT`.

## First dollar plan (24 h)

1. Set `CONTACT` (and `PAY_URL` if you have a Stripe account), then push.
2. Run the Lead list for `transit`, `trucking`, `freight`, `port`, `longshore`, `credit union`, `church`, `restaurant`. Export the CSVs and pick the 30 stale apps with the most ratings that have a seller website.
3. Send each one **Copy outreach**, plus a 15-second screen recording of the letterbox if you have a Duo or the Xcode 27.1 simulator.
4. Post the free checker in r/iOSProgramming, r/SwiftUI, r/indiehackers, r/SideProject, r/apple (the Duo megathread), the iOS Dev Slack/Discord communities, and on X under the Duo review threads. Lead with the free tool, not the pitch.
5. Close one $299 rebuild. The CI below already builds on the Xcode 27 image, so delivery is a branch plus a PR.

## Evidence

- Reviews: unoptimized apps get black bars ([GadgetReview](https://www.gadgetreview.com/?p=422523), [PhoneArena](https://www.phonearena.com/news/iphone-duo-will-make-unoptimized-apps-look-absolutely-hideous_id183203)). PhoneArena says airline, banking and government apps may take years.
- Only apps built with the iOS 27.1 SDK fill the inner display ([Notebookcheck](https://www.notebookcheck.net/Apple-iPhone-Duo-Developers-can-now-submit-optimized-apps.1418401.0.html)).
- A consultancy's scoping guide puts the work at days to weeks per app and publishes no rate card ([eCorpIT](https://ecorpit.com/iphone-duo-app-support-cost-engagement-guide-2026/)).
- Developers are already hitting Duo layout bugs ([Stack Overflow](https://stackoverflow.com/questions/80010788/iphone-duo-tab-bar-briefly-moves-right-after-dismissing-a-fullscreen-modal)).
- "Old ones get black bars… If your app runs on iPhone, it's on a foldable now" ([X](https://x.com/solaymanhaider/status/2114783849293181035)).
- Developer write-ups ([STRV: Is your app Duo-able?](https://strvcom.substack.com/p/is-your-app-duo-able), [Everything about iPhone Duo for devs](https://salgara.substack.com/p/everything-about-iphone-duo-for-devs)).

## Repo layout

- `web/`: static PWA (vanilla JS, localStorage). Two panes at 700 px and wider (the Duo inner display), one pane below that.
- `ios/`: XcodeGen project (iOS 26.0+, `com.assiamah.duoready`). It has the same checker in a NavigationSplitView with a real detail pane, a readiness checklist and a layout lab that shows size class and safe areas live as you fold. State is kept with `@SceneStorage` / `@AppStorage`, and everything stays on device.
- `.github/workflows/pages.yml`: deploys `web/` to GitHub Pages.
- `.github/workflows/ios.yml`: unsigned simulator build on the `xcode-27` runner.

```sh
cd ios && xcodegen generate && open DuoReady.xcodeproj
```

DuoReady is not affiliated with Apple.
