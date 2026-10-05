# Design

How **Forage & Flower** looks, sounds and behaves. It is a shared garden app for a two-person household, running one garden in Victoria, BC (zone 9a) from two Android phones. It is the simple first step toward a larger, photo-based garden planner.

This file started as a draft in October 2026. Rules marked **Built** are in the app; **Planned** ones are agreed but not built yet.

- Background: a market scan of 14 garden, plant-care and native-plant tools, and four design directions, done before this file (October 2026).
- Garden content it starts from: the household's own garden notes, kept outside this repo.

## Decided so far

| Decision | Detail |
|---|---|
| Users | Two people in one household. One shared garden; both see and edit everything. |
| Tasks | A shared checklist. No assigning tasks to one person; each finished task shows who did it. |
| Phones | Both Android. An installable web app on the home screen. |
| Source of truth | The app. Schedule, shopping lists, suppliers and rankings are imported once from the markdown, then edited in the app. Design files (site plans, decision log, soil analysis) stay as markdown reference. |
| Reasons and rules | Shown in the app: why a plant is recommended, and the site rules that apply to it. |
| Done means | Both: a task is ticked, **and** what was planted, where and when is recorded. |
| Reminders | A monthly email, built from the app's own data. Push notifications later, if wanted. |
| Plants | Plants on the plan, plus the wider ranked lists for browsing. |
| Edibles | Included alongside natives and pollinator plants. |
| Name | **Forage & Flower** (2026-10-03). A florist in Newnan, Georgia uses the same name; fine for a private app, but check trademarks and the Play Store before any public release. |
| Direction | Field Guide look, Calm Utility interactions, year ring on Pollinator picks only (2026-10-03). |

## Direction

**Decided (2026-10-03):** Direction A (Field Guide) for the look, Direction B (Calm Utility) for how things work, and Direction D's year ring on the Pollinator picks screen only.

- A suits a native-plant garden: paper and ink, careful Latin names, a 12-month bar on every plant.
- B's swipes and chips make a shared checklist fast to use outside.
- D's ring is the clearest way to show when threatened pollinators need food against what's flowering. On the home screen it would push the checklist down, so it lives on Pollinator picks.

## Principles

### Borrow

| Rule | From | Where | Status |
|---|---|---|---|
| One month list with three headings: **Do**, **Plant**, **Buy**. | Things 3 | This month | Built |
| A small "Done by J" on each finished task, with the date. | Planta, Todoist | This month, plant history | Built (This month) |
| Swipe right to finish; swipe left to push to next month. Pushed tasks are never shown as overdue. | Todoist | This month | Built |
| A 12-month bar on every plant, with rows for planting, flowering and pollinator use. | Merlin Bird ID | Plant pages, Plant now cards | Planned |
| Spring and fall lists grouped by nursery, so each group is a shopping trip. | Our own shopping lists | Seasons | Planned |
| Each pollinator pick says why in plain words, e.g. "Winter food for western bumblebee queens (threatened)". | RHS Grow, Calscape | Pollinator picks, plant pages | Planned |
| Site rules on the plant page, in a ruled box: "No biochar here", "Fir mulch, not alder". | Seed packet backs | Plant pages | Planned |
| A planting log per plant, filterable by action (planted, moved, divided, died). | Planta | Plant pages | Planned |
| Kind copy, and a monthly summary against your own past: "6 natives planted this fall, up from 2 last fall." | Gentler Streak | This month, monthly email | Planned |
| Nursery notes with a "last checked" date, so stale stock info is visible. | Calscape (and its stale-data complaints) | Plant pages, Seasons | Planned |
| Works with no signal in the garden; changes sync later. | An offline outbox | Everywhere | Built (This month) |

### Avoid

| Rule | Why |
|---|---|
| No red overdue counts or "15 days left" countdowns. | RHS Grow's countdowns read as nagging. Gardening runs on seasons, not deadlines. |
| No treating every plant as a spring annual. | Every planner app does this. Perennials, shrubs, bulbs and fall planting are the core here. |
| No "where to buy" that means one store. | Name the local nursery that actually stocks it. |
| No long setup. | The garden's content is already written; the app opens full. |
| No upsells, ads, ratings prompts or AI. | Two users, no business model yet. |
| No social feed. | GardenTags and Candide died maintaining one. |

## Screens

1. **This month.** A kicker line ("OCTOBER · VICTORIA 9a"), a serif title for the season's theme ("Fall planting window"), then the checklist under Do / Plant / Buy, then "Plant now" cards. Chips filter: All · Do · Plant · Buy.
2. **Seasons.** Fall and spring lists. Each plant shows quantity, site and status (to buy, bought, planted), grouped by nursery.
3. **Plants.** Your plants first, then the wider ranked lists. A plant page holds: common and Latin name, 12-month bar, sites, why it's recommended, where to buy, site rules, and the planting log.
4. **Pollinator picks.** Plants ranked by support for threatened species, led by the threat-status tiebreaker in `perennial-flowers.md`. The year ring sits at the top, with a plain list below it for accessibility.

Bottom navigation: Month · Seasons · Plants · Pollinators.

## Colour (Field Guide)

Colours are tokens. Ratios below were measured when This month was built (October 2026); 4.5:1 is the minimum for body text.

### Light

| Token | Value | Use |
|---|---|---|
| `--bg` | `#f5f1e6` | Page (paper) |
| `--surface` | `#fffdf7` | Cards, plant cards |
| `--ink` | `#22251f` | Text |
| `--muted` | `#5d5f55` | Secondary text, Latin names, site tags |
| `--line` | `#d9d2c1` | Hairline rules and borders |
| `--accent` | `#2f5d46` | Fir green: buttons, checks, selected tab |
| `--lichen` | `#a3b18a` | "Done by" initial chip, soft fills |
| `--bloom` | `#c2553d` | Salmonberry: flowering months on the 12-month bar |
| `--pollen` | to choose | Pollinator-use row on the 12-month bar, year ring arcs |

### Dark

Warm charcoal, not black. Starting values: `--bg #1a1c18`, `--surface #23261f`, `--ink #ece8dc`, `--muted #a9ac9e`, `--line #3a3d33`, `--accent #7fb08f`, `--lichen #4a5640`, `--bloom #e58a72`. Light is the default; dark is a choice in Settings.

### Measured contrast

| Pair | Light | Dark |
|---|---|---|
| Ink on lichen ("done by" initials) | 6.81 | 6.36 |
| Muted on surface (task details, dates) | 6.38 | 6.64 |
| Accent on accent-soft (selected tab, swipe hint) | 6.11 | 4.85 |
| Text on accent (check mark, buttons) | 6.71 | 6.96 |

Dark lichen started at `#6f7d5a` (3.60 with ink) and was darkened to pass.

## Type

- **Headings and Latin names:** Newsreader. Latin names are always italic and secondary to the common name.
- **Body:** Public Sans, weights 400, 500 and 600.
- Bundle both fonts with the app, so they work offline and no font service is called.

## Voice

Plain, calm and specific to this garden.

- Name the plant and the place: "Plant the loquat at the south wall", not "Planting task due".
- Say "Nothing urgent this week", never "3 overdue".
- Reasons are concrete: "Winter food for western bumblebee queens (threatened)", not "Great for pollinators!".
- Common names first, Latin names second.
- Rules say what to do: "Grit in the hole, no compost", not "Avoid over-fertilising".

## Open decisions

None right now.

## Also decided (2026-10-03)

- **Photos:** none for now. Plant pages are designed to work without them; the photo space in the mocks becomes the 12-month bar and the reason line.
- **"Done by" label:** initials.
- **Pollen colour:** chosen during the build, to suit what pollen means here: food for pollinators, especially threatened species. It must read clearly against fir green and salmonberry on the 12-month bar, in light and dark.
