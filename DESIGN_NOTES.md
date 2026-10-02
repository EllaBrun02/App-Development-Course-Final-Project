# Interface redesign

The revised interface uses ink purple (#291c3a), violet (#6535b5), cool white (#faf9fc), lavender (#eee8f6), and sun yellow (#f6ce55). Heavy sans-serif headlines replace the former green/serif treatment; Georgia remains for long-form article text. See `design-system/MASTER.md` for the decisions informed by UI UX Pro Max and Frontend Design.

The home page presents the first result as a lead story, followed by a two-column Flexbox feed. On phones it becomes one column; the weather and topics move below the feed. Shared styles cover sign-in, reporter/editor dashboards, forms, review comparisons, and analytics. Wide management tables scroll within their container rather than stretching the page.

All existing Express, EJS, MongoDB and vanilla JavaScript architecture is retained. No UI framework or production dependency was added. Search, category/history filters, sorting, and 20-article infinite scrolling retain their existing API contracts. Feed requests now cancel superseded requests, with visible loading, retry, and empty states.

Accessibility improvements include a skip link, keyboard focus indicators, named filter controls, loading announcements, reduced-motion support, and larger touch targets.

## Files to understand

- `public/css/style.css`: shared colors, typography, components, and responsive layouts.
- `public/css/home.css`: edition heading, lead story, and responsive article feed.
- `public/css/article.css`: long-form reading and comments.
- `public/js/home.js`: asynchronous filtering, pagination, request cancellation, and feedback.
- `views/partials/`: shared masthead, footer, and weather.
- `views/index.ejs`: search controls and news page structure.

## Running

Install dependencies with `npm install` at this repository's root (the folder containing `package.json`), start MongoDB, then run `npm start`. The application opens at http://localhost:3000; set `PORT` and `MONGO_URI` for another local configuration. Only use `npm run seed` when intentionally resetting demo data: the existing seed script clears collections.

## Verification scope

For the October 2 PR review, regression tests, fixes and limitations, see [DESIGN_PR_REVIEW.md](DESIGN_PR_REVIEW.md). The notes below describe the earlier design-only verification.

Responsive and interaction checks use the actual EJS templates and client scripts with temporary sample API responses. These checks do not verify database persistence, authentication, publishing authorization, real weather fetching, or the full assignment requirements. Run those flows with MongoDB before the project demonstration.

Verified ten page layouts at 320, 390, 768, and 1440 pixels with no page-level horizontal overflow. Browser checks passed for category filtering, empty-state reset, rapid filter changes, and 20-to-40 article infinite scrolling, with zero uncaught page errors. Page-specific EJS asset variables are now scoped and passed explicitly to shared partials to prevent scripts leaking between pages.
