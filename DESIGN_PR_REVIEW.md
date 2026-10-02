# PR #5 review and fixes

Reviewed on 2026-10-02 against `dev` at `7ed5d90`. Merged that base into `design/editorial-responsive` and resolved the two editor-template conflicts while retaining the responsive layout. No merge into `dev` was performed.

## Findings fixed

| Priority | Location | Reproduced problem and fix |
| --- | --- | --- |
| P1 | `views/editor/article-review.ejs:34` | A pending article containing `</script>` could escape the inline JSON script. The server now renders escaped text; optional diff highlighting reads that text from the DOM. Browser verification confirmed the test script remained visible text and did not execute. |
| P1 | `views/article.ejs:36` | Public article bodies were rendered as raw HTML. They now render as escaped plain text, with CSS preserving newlines. Author-supplied HTML is intentionally displayed literally. |
| P1 | `controllers/editorController.js:48` | Editing from a pending-update review loaded and overwrote the live article. The form now shows the pending version and sends an explicit target; the server rejects stale or mismatched targets. Approval publishes the editor's corrections. Category stays unchanged while editing a pending update. |
| P2 | `controllers/editorController.js:66` | Direct editor requests bypassed form validation. The server now checks required strings, title/summary lengths, category and HTTP(S) image URLs before changing data. |
| P2 | `views/editor/article-review.ejs:34` | Comparison panels were empty until the external Diff library loaded, omitted images, and ordinary review showed literal `<br>` text. Both versions now have escaped server-rendered text and image previews; line breaks remain readable without the library. |
| P2 | `public/css/style.css:361` | A later desktop rule overrode the tablet sidebar width. At 768px the sidebar was only 260px wide. It now uses the available 720px content width. |
| P2 | `public/css/style.css:301` | An unbroken long user name widened the tablet document to 792px in a 768px viewport. Navigation now stays within the available width and names wrap. Button hover text also retains contrast. |
| P2 | `public/js/analytics.js:20` | Publication lines reused the first range's points, and late/failed responses could replace or leave an old chart. Each chart now owns its marker plugin; superseded requests are cancelled/ignored and failures remove stale charts. |
| P2 | `public/js/image-fallback.js:3` | Failed image URLs showed broken images. Public articles, review previews and dynamically loaded cards now use a local fallback, with protection against retry loops. The public hero reserves its aspect ratio. |
| P2 | `views/editor/article-edit.ejs:31` | The edit UI used a `div` instead of a form, bypassing native URL/length validation and keyboard submission. It now uses a submit form, focuses invalid fields, announces feedback, and respects reduced-motion preferences. Review and analytics feedback are also announced. |

Some functional findings were also present in `dev`; they were fixed here because they affect the screens changed by this PR. This review does not close the separate 38-item project audit.

## Verification

- Local verification: **13 passing checks**, using real HTTP, login sessions, EJS rendering and a unique disposable MongoDB database. The analytics checks execute the real client script with controlled network and canvas boundaries. These scripts are maintained outside the repository and are not part of the submission.
- Browser: home, editor dashboard, review, edit and analytics at **320, 390, 768, 1024 and 1440px**; no document-level horizontal overflow. Reporter dashboard and new-article form also passed at 320, 768 and 1440px. Wide tables keep their own horizontal scrolling.
- Browser: pending-update save, inert script text, category filtering, public image fallback and analytics range switching. The test account included an 80-character unbroken name.
- JavaScript syntax, EJS compilation and `git diff --check` passed.

The local checks use MongoDB on `127.0.0.1:27017` and remove only their own generated database. Native dependencies must match the local platform; this Mac's run used the existing native bcrypt build via a temporary preload, without changing tracked `node_modules`. No test command or new testing dependency is included in this PR.

The browser fixture used separate disposable data and fixed weather responses. Live weather availability, a full load test and every older audit issue were outside this review. The legacy `tests/stress-test.js` was not run: it hardcodes port 3000 and expects seeded data. Runtime logs are excluded from the fix commit.
