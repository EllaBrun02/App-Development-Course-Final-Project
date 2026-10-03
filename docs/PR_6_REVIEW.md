# PR #6 review — 2026-10-02

Reviewed `fix/audit-01-18` against `dev` at 8db36cb, including the previously merged responsive design. The seven merge conflicts were resolved while preserving escaped rendering, responsive templates, image fallback and analytics fixes.

## Corrections made

- **Session expiry:** protected mutations and API reads return JSON 401/403 responses even without an explicit JSON Accept header. A redirected login page can no longer appear to be a successful fetch action.
- **Input validation:** non-object JSON bodies are rejected. The request-size limit accommodates the validated 100,000-character article limit, including Hebrew UTF-8 text. Deleting a missing article returns 404. Publication events in management must belong to the view record's UTC hour.
- **Saving:** fields are locked while leaving after a reporter save and while an editor save/redirect is pending. Initial draft creation locks the category once creation starts. Successful retry clears the previous failure message; a failed editor save restores each field's prior enabled state.
- **Review integration:** the responsive editor receives the pending/main target and revision, supports incomplete drafts, validates category changes, and hides direct editing of already published content. Review corrections are saved to the pending version.
- **Reading history:** the merged filter uses the current session's article history rather than global view counts.
- **Management:** changing resource clears stale rows immediately; outdated request errors are ignored; pagination is disabled during loading. Saving/deleting locks the form and resource controls so an older response cannot erase newly entered work. Long record text wraps on mobile.

## Verification and scope

63 private checks passed, covering the audit workflow and regressions from the design PR. Browser checks verified Hebrew draft reload, safe comparison rendering, pending-only editing, comment editing, and mobile/tablet layouts. JavaScript/EJS compilation and diff whitespace checks passed.

Verification scripts were kept outside this repository as requested. No new test files, test dependencies, or npm test command are included in the final PR diff against dev. Existing upstream test assets are unchanged.

The review addresses this PR and findings 1–18. It is not a claim that all 38 audit findings, deployment hardening, or large-scale performance testing are complete.
