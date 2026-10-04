# Forage & Flower

A shared garden app for one household in Victoria, BC: the fall and spring planting lists, where to buy each plant, the monthly to-do list, and pollinator picks led by threatened species.

- How it looks: `DESIGN.md`
- What gets built, in what order: `PLAN.md`

## How it works
- Installable web app (Vite + React + TypeScript + vite-plugin-pwa), hosted on GitHub Pages at `/forage-and-flower/`.
- Data will live in a shared Supabase project, in its own `garden` schema. That project's migrations are managed outside this repo. Not connected yet (PLAN.md, build step 1).
- Fonts (Newsreader, Public Sans) are bundled so the app works offline.

## Develop
1. `npm install`
2. `npm run dev` and open http://localhost:5173/forage-and-flower/
3. `npm run icons` after changing `public/icon.svg`.

## Importing the garden
`npm run import:garden` reads the garden's markdown notes and never changes it. Set `GARDEN_DIR` (and optionally `REMINDER_TASKS_JSON`, the reminder job's task file, for a cross-check) in `.env.local`, or pass the folder as an argument. It writes to `scripts/private/`, which is git-ignored because this repo is public:

- `garden-import.json`: sites, nurseries, plants, rules, plan items and tasks, in the app's shape
- `import-report.md`: what needs a decision, what was inferred, and what was skipped
- `spring-2026-review.md`: the spring 2026 list, to mark what was bought

Nothing is loaded into the database until the report's decisions are answered.
