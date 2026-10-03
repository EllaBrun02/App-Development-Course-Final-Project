# Audit findings 1–18

This PR implements findings 1–18 from the explanatory PDF and includes the responsive design already merged into `dev` (8db36cb). Findings 19–38 are outside this review; this document does not claim that the entire audit is complete.

| Finding | Implementation / verification |
| --- | --- |
| 1 | Article body is escaped text with preserved line breaks. HTTP regression submits script-like content and checks rendered output. |
| 2 | Review text is server-rendered with escaped EJS. The optional Diff enhancement reads that text from the DOM; submitted text is never interpolated into executable JavaScript. Both versions and their images remain readable without Diff. |
| 3 | New draft creation accepts partial content. Typing creates a draft automatically. A client draft key makes retried creation idempotent. |
| 4 | Every input writes a user-scoped local recovery copy; internal navigation waits for saving. Closing warns while dirty. Page hiding attempts a keepalive save. Work is marked clean only on server acknowledgement. A last-moment network save cannot be guaranteed after a crash; the local recovery copy covers that gap on the same browser. |
| 5 | Manual saving removes old server autosave data; the client serializes requests so older autosaves cannot finish after a manual save. |
| 6 | Nullish fallback restores deliberately empty strings rather than substituting older values. |
| 7 | HTTP failures and network failures keep the dirty/recovery state and show a failure. Editing or Save Draft retries; conflicting server revisions require reloading/reviewing recovery. |
| 8 | Editor review links target the pending version. The server requires an explicit main/update target and validates pending-update state. Editing then approving an update is covered by regression tests. |
| 9 | Reporter ownership and workflow guards are checked server-side. Pending submissions cannot be overwritten/autosaved. Optimistic concurrency and client revisions reject stale writes with 409. |
| 10 | Returning either kind of submission requires a nonblank note at the server. |
| 11 | The viewed filter uses the session's read history. Private checks verify a new session and read/unread filtering after visiting an article; the merge regression that used global view counts was corrected. |
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
PORT=3100 MONGO_URI=mongodb://127.0.0.1:27017/ella_daily_web npm start
```

## Verification

63 private checks passed using real HTTP/Express/Mongoose/MongoDB requests and controlled client-side DOM/timer harnesses. The suite covers rendering, draft recovery and saving, ownership/state transitions, pending-version editing and approval, CRUD, input validation, pagination, and the inherited design/analytics regressions. JavaScript and EJS compilation and whitespace checks also pass.

Browser checks used a separate disposable database and confirmed:
- A new Hebrew draft auto-created without a Save click and retained its contents after reload.
- Editing a pending update changed only the pending panel; the published panel stayed unchanged.
- Script-like article text remained visible text and did not execute.
- The management screen saved an edited comment and fit widths of 320, 390, 768, 1024 and 1440 pixels, including a 900-character unbroken comment. Reporter/edit/review layouts were also checked at mobile/tablet widths.

At the project owner's request, verification scripts live outside the Git repository. The two audit test files and the npm test command have been removed from this PR. Existing test assets inherited from dev are unchanged. Test runs used uniquely named disposable databases and did not seed or modify the application database. A temporary local bcrypt resolution shim was used for this workstation's native binding; no shim or machine-specific runtime path is part of the PR.

No production framework or library was added. Last-moment browser/network failures still require local recovery on the same browser; only server-acknowledged work is available on another computer. Offset pagination can shift when new articles arrive, and multi-collection transaction consistency remains outside findings 1–18.
