# Submission readiness fixes

This change addresses readiness items 1, 2, 3 and 5 from the 3 October review of `dev`. Item 4, the optional Diff dependency, is deliberately unchanged. Course permission for that dependency is not claimed here.

## Weather freshness

`utils/weather.js` validates the provider's observation timestamp and expires values 15 minutes after that observation, rather than 15 minutes after our request. Old/invalid observations and provider failures return an unavailable state with no numeric weather values. A shared refresh promise prevents concurrent duplicate requests; a one-minute failure backoff prevents repeated visitors from overwhelming the provider during an outage.

The server-rendered widget includes its expiry deadline. `public/js/weather.js` clears values at that deadline independently of its regular poll, and rechecks expiry when a suspended page becomes visible or returns from browser history. A failed refresh also clears displayed values. The API response is marked `Cache-Control: no-store`.

The provider's GMT timestamps are interpreted as UTC; see [Open-Meteo API documentation](https://open-meteo.com/en/docs).

## Persistent comment limits

`middleware/rateLimit.js` reserves at most three attempts in a rolling 60-second window for each IP address and signed device identifier. Each reservation uses an atomic conditional MongoDB update. The `commentLimits` infrastructure collection keeps only hashed keys, recent timestamps and a TTL expiry date; it is separate from the four editable domain models.

The IP fallback prevents cookie replacement/removal from granting another allowance. This deliberately conservative policy means people sharing an IP address share its three-attempt allowance. A browser cookie cannot prove physical-device identity. Attempts may count even if later validation or comment storage fails; rejected requests receive 429 and a retry hint. If the limiter cannot reach its store, posting fails closed with 503.

The window survives process restarts and is shared by multiple instances using the same database and signing secret. TTL cleanup removes old records; the query itself filters old timestamps, so correctness does not depend on the TTL worker running at an exact instant. The app does not trust arbitrary forwarded-IP headers.

## Existing demonstration data

`npm run demo:updates` adds three explicitly fictional examples without clearing users, articles or comments. Each includes initial publication plus two approved-update markers and 72 hourly view buckets. Their view totals match the bucket totals. Stable draft keys skip already completed examples. An interrupted example remains unpublished until its statistics are prepared; a later run can finish it. A manually altered demo draft is left untouched.

For an existing database, use this command instead of the destructive full seed. Configure the same `MONGO_URI` for preparation and app startup. In the editor, search `Demo:` and select Analytics → Last 7 days.

The existing local demo was prepared with this command: three stories were added, all original 500 articles were unchanged, and its 862 comments and seven users were retained. The database now contains 503 articles. Database changes do not travel with a Git branch; another installation must run the preparation command against its own database.

## Submission files

Dependencies and generated logs are no longer tracked. Tests and the test ZIP are kept outside the repository as requested. No new dependency was introduced. README and setup instructions describe the current files, protected CRUD interface, autosave guarantees, environment settings and source ZIP preparation.

Use `npm ci` after checkout. Keep local secrets out of the hand-in, and build the ZIP from the exact commit being submitted using `git archive`. The lecturer's repository link and the defense demonstration should identify that same revision. This change does not merge to `main` or submit anything to the lecturer.

## Verification

- 78 private checks passed: the 63 earlier regressions plus expiry, resumed-page, outage, cookie-reset, persistent rolling-window, two-process concurrency and additive-demo checks.
- Browser verification showed fresh values clearing at expiry during a simulated provider outage, with no overflow at 320px or 768px.
- Demo analytics rendered the initial publication and both update markers with hourly data before and after updates.
- `npm ci` succeeded on Node v24.15.0. Existing transitive-package deprecation warnings remain; no dependency upgrade was bundled into this change.
- The Diff template and client comparison script were verified unchanged from `dev`.

Verification scripts and browser failure-injection helpers are local-only and are not part of the submitted application.
