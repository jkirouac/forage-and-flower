# Build plan

The plan for building **Forage & Flower**, the shared garden app for a two-person household. How it looks is in `DESIGN.md`. The garden content it starts from is the household's markdown garden notes, kept outside this repo.

October 2026. Steps 1 to 6 of the build order are done.

## Purpose

One place for the two of you to run the garden through the year: what to plant this fall and next spring, where to buy it, what to do this month, and which plants best support threatened pollinators. It replaces the markdown schedule, the shopping lists and the reminder JSON as the working copy. It is also the first step toward a larger, photo-based garden planner.

## What success looks like

After one fall and one spring of use:

- Both of you open it at least weekly in the growing season, and ticked tasks show both sets of initials.
- The monthly email is built from the app, and the reminder job's task file is retired.
- Every planting, move, division and loss is recorded in the app, not in markdown.
- The fall and spring lists are used at the nursery: items move from "to buy" to "bought" to "planted".
- Nothing has to be edited in the markdown files to keep the app current.

## Not in the first version

- Photos (decided: none for now)
- Push notifications (the monthly email covers reminders)
- AI of any kind, including the photo-based designs planned for the larger garden planner
- Other gardens or other users
- Live nursery stock. Nursery notes carry a "last checked" date instead
- Weather, frost alerts and watering schedules
- Bed layouts or drawings

## How it leads to the larger garden planner

Built to be reused later:

- **The plant catalogue:** common and Latin names, kind, bloom months, planting months, pollinator months, and the threatened species each plant supports with a plain-words reason. This vetted regional list is the core of the larger planner.
- **Rules as data:** biochar, castings and mulch exclusions stored as rules on plants and sites, not as text. The planner will need the same rules to avoid recommending the wrong thing.
- **Nurseries:** names, locations, what each is good for, and which plants they carry.

Specific to your garden, and not reused: your nine sites, your plan items, your plantings and your tasks.

To keep that line clear, the catalogue and nurseries are their own tables, and everything about your garden hangs off a `garden` record.

## Infrastructure

A small installable web app with its data in a shared Supabase project.

| Part | Choice |
|---|---|
| App | Vite + React + TypeScript + `vite-plugin-pwa`, with an offline outbox, a content security policy, an install banner and a theme switch. |
| Hosting | GitHub Pages, repo `jkirouac/forage-and-flower`, deployed by a workflow with pinned actions. |
| Database | A shared Supabase project that also hosts other apps, in its own `garden` schema. No new project and no extra cost. |
| Migrations | Managed outside this repo, with the shared project's other migrations. This repo never pushes to the shared project. |
| Sign-in | Email and password, using the shared project's login (decided 2026-10-03). |
| Fonts | Newsreader and Public Sans, bundled with the app. |
| Monthly email | Keeps the existing scheduled GitHub job and Gmail sending. A small function inside the Supabase project builds the email from the app's data; the job fetches it with a token that can do nothing else (decided 2026-10-03). The project's master key never leaves Supabase. |

**Timing:** the `garden` schema goes in after another app's move into the shared project finishes, so two changes don't overlap.

## Data

All tables live in the `garden` schema. Row-level security: a person can read and write only a garden they belong to.

| Table | Holds |
|---|---|
| `gardens` | One row: your garden. Name, region, hardiness zone, frost dates (Mar 6 – Nov 16). |
| `members` | Who belongs to a garden, with their initials. |
| `plants` | The catalogue. Names, kind (native, edible, ornamental, fern, bulb, tree or shrub), plant / bloom / pollinator months, threat tier and reason, rank. |
| `rules` | Do and don't rules attached to a plant, a kind of plant, or a site. Examples: "No biochar: acid-loving", "No castings: lean site". |
| `sites` | Your nine sites: number, name, sun, water, size, notes. |
| `nurseries` | Name, location, website, phone, what they're good for, notes, last checked. |
| `plan_items` | A plant at a site for a season: quantity, status (to buy, bought, planted, skipped), nursery, notes. |
| `plantings` | What happened, where and when: planted, sown, moved, divided, died. Who did it. |
| `tasks` | Monthly jobs under Do, Plant or Buy. Recurring ones (the Worm Wigwam crank) repeat every month. Can point at a plant, site or plan item. |
| `task_checks` | Each tick: which task, which year, who, when. Also "pushed to next month". |

## Moving your content in

A one-time import script reads the garden notes and writes to the app, then prints a report of anything it couldn't place.

| From | Into |
|---|---|
| `planning/schedule.md` (and the reminder job's task file, to cross-check) | `tasks` |
| `plants/shopping-list-2026-fall.md`, `shopping-list-2027-spring.md` | `plan_items` |
| `planning/suppliers.md`, `plants/nursery-routing-spring-2026.md` | `nurseries` |
| Plants on your plan and in the schedule, plus every ranked plant in `plants/perennial-flowers.md` (all 48, added 2026-10-06) | `plants` (the other ranked files come later) |
| The notes' site list and biochar, castings and mulch rules | `sites`, `rules` |

Before the import runs, anything the script can't place cleanly (a plant at a site that doesn't exist, a quantity like "2–3") gets a decision. Answers are kept in a private decisions file, so a re-run applies them instead of asking again. **Done 2026-10-03:** every question answered.

**Spring 2026 purchases are not reviewed up front** (decided 2026-10-03). The current fall 2026 and spring 2027 lists are imported as they are, and quantities, sites and statuses are corrected in the app as you go.

After the import, the schedule and shopping-list files get a note at the top saying the app is now the working copy. Design files stay as they are.

## Build order

Each step ends with something you can use.

1. **Set up.** Repo, app shell, the `garden` schema, sign-in, and your garden with both of you as members. A privacy check confirms an outsider can't read it. **Done.**
2. **Import.** Script and report (done), then loading the result into the database. **Done.**
3. **This month.** The checklist under Do / Plant / Buy, initials on ticks, swipe to finish or push to next month, works offline. This is the screen you'll use weekly, so it comes first. **Done.**
4. **Seasons.** Fall and spring lists grouped by nursery. Edit any item in place: quantity, site, nursery, status (to buy, bought, planted, skipped). Add a plant to a season, or remove one. This is where the lists get corrected, since spring 2026 purchases weren't reviewed before the import. **Done.**
5. **Plant pages.** The 12-month bar, the rules box, where to buy, and the planting log. Recording a planting from here also ticks the matching task. **Done.**
6. **Pollinator picks.** The ranked list with reasons, and the year ring with a plain list beneath it. **Done.**
7. **Monthly email.** The function that builds the email, its token, and a change to the reminder job to fetch from it instead of its task file. Then retire the task file.

**Checks at every step:** a phone-size walkthrough with screenshots, the privacy check, and once colours are set, a contrast check.

## Questions to settle during the build

1. **Where the email function is deployed from.** Alongside the shared project's migrations, or from this repo.
