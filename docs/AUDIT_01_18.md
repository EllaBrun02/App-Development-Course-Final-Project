# Audit findings 1–18

This branch starts at main (e76e4c3), independently of design/editorial-responsive. It implements the first 18 findings in the explanatory PDF. Findings 19–38 are not claimed as resolved.

| Finding | Implementation / verification |
| --- | --- |
| 1 | Article body is escaped text with preserved line breaks. HTTP regression submits script-like content and checks rendered output. |
| 2 | Main already rendered review text through escaped EJS, without embedding submitted text in a script. That safe path is retained, with a script-termination regression. This is not the Diff implementation on the design branch. |
| 3 | New draft creation accepts partial content. Typing creates a draft automatically. A client draft key makes retried creation idempotent. |
| 4 | Every input writes a user-scoped local recovery copy; internal navigation waits for saving. Closing warns while dirty. Page hiding attempts a keepalive save. Work is marked clean only on server acknowledgement. A last-moment network save cannot be guaranteed after a crash; the local recovery copy covers that gap on the same browser. |
| 5 | Manual saving removes old server autosave data; the client serializes requests so older autosaves cannot finish after a manual save. |
| 6 | Nullish fallback restores deliberately empty strings rather than substituting older values. |
| 7 | HTTP failures and network failures keep the dirty/recovery state and show a failure. Editing or Save Draft retries; conflicting server revisions require reloading/reviewing recovery. |
| 8 | Editor review links target the pending version. The server requires an explicit main/update target and validates pending-update state. Editing then approving an update is covered by regression tests. |
| 9 | Reporter ownership and workflow guards are checked server-side. Pending submissions cannot be overwritten/autosaved. Optimistic concurrency and client revisions reject stale writes with 409. |
| 10 | Returning either kind of submission requires a nonblank note at the server. |
| 11 | Main already used the session's read history. Tests verify both a new session and read/unread filtering after visiting an article. |
| 12 | Date and popularity sorting use descending _id as a unique tie breaker. Offset pagination remains; concurrent changes to sort values can still shift pages. |
| 13 | Editor-only CRUD, detail/list/search APIs and a management screen for Users, Comments and ViewStat. Article creation remains reporter-owned, with editor search/read/edit/delete. Password hashes are excluded. User deletion is blocked for authors and the current editor. Roles are checked against current database records. ViewStat CRUD recalculates article totals; concurrent multi-collection consistency remains a finding 29 concern. |
| 14 | Reporter dashboard projection includes pending update status and note. |
| 15 | Pending filter includes published articles with pending updates. |
| 16 | Shared field/type/length/URL validation. Partial drafts are allowed; submission/publication require complete text. Only explicit editable fields are accepted. |
| 17 | Search input is bounded and escaped as literal regex text. |
| 18 | Invalid IDs, pagination, malformed cookies/JSON and validation failures return client errors. Version/duplicate conflicts return 409. API error responses are JSON. |

## Running

Use Node.js 20 or later and a running local MongoDB on port 27017. Install dependencies for your platform with `npm ci` first. The upstream repository tracks node_modules, including native binaries that may be for a different OS; those files have not been modified by this branch.

```sh
npm ci
npm test
PORT=3100 MONGO_URI=mongodb://127.0.0.1:27017/ella_daily_web npm start
```

`npm test` creates and drops its own uniquely named `audit_test_*` database. It never seeds or drops the application database. TEST_PORT can override port 3198 if occupied. The HTTP suite uses real Express/Mongoose/MongoDB; client tests run the real autosave script in a small DOM/storage/timer harness with controlled HTTP responses.

For this workstation the native bcrypt binding in upstream node_modules could not load. The test run used a temporary external module-resolution shim pointing only bcrypt to the already installed local project copy. No shim or machine-specific path is required or included in the shipped tests; `npm ci` prepares platform-native dependencies normally.

## Verification

31 automated tests passed. EJS templates and JavaScript compile, and git diff --check passes. In a separate disposable database/browser session, a new draft auto-created, survived reload, the management page listed accounts, and editing a pending update changed the pending panel while leaving the published panel unchanged.

No new production framework/library was added. The two branches are intentionally independent; they both touch templates and article editing, so merging them together needs deliberate conflict resolution. In particular, do not reintroduce the design branch's raw Diff payload script into the escaped review implementation.
