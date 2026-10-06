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
| Voice notes | Speak a note on This month; Claude tidies it and sorts it into one-off tasks and notes; you check it before it's saved (2026-10-05). The phone's own speech recognition does the listening. |

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
| Tap a card to tick it done, then "Clear N checked off". Press and hold a card and drag it onto another month to move it there; it shows "From Oct". Moved tasks are never shown as overdue. (Replaced swiping, 2026-10-07.) | Mealboard, Todoist | This month | Built |
| Plant names in a task are underlined links to their pages. A small arrow opens the task's note (how-to video, who did it, and a "Move to" picker for keyboards and screen readers). | Things 3 | This month | Built |
| A 12-month bar on every plant, with rows for planting, flowering and pollinator use. | Merlin Bird ID | Plant pages, Plant now cards | Built (plant pages) |
| Spring and fall lists grouped by nursery, so each group is a shopping trip. | Our own shopping lists | Seasons | Built |
| Each ranked pollinator plant says why in plain words, e.g. "Winter food for western bumblebee queens (threatened)". | RHS Grow, Calscape | Pollinators, plant pages | Built |
| Site rules on the plant page, in a ruled box: "No biochar here", "Fir mulch, not alder". | Seed packet backs | Plant pages | Built |
| Small icon chips for who a plant feeds and what it's like, instead of a dense line of notes. | Structured, seed packets | Plant pages | Built |
| The same chips as filters on Plants, in two labelled rows (Feeds; Good to know) that scroll sideways. Any number on, all must match; chips that would empty the list are hidden, chosen ones never are; a one-line summary with Clear. | Mealboard | Plants | Built |
| A planting log per plant, filterable by action (planted, moved, divided, died). | Planta | Plant pages | Built |
| Kind copy, and a monthly summary against your own past: "6 natives planted this fall, up from 2 last fall." | Gentler Streak | This month, monthly email | Planned |
| Nursery notes with a "last checked" date, so stale stock info is visible. | Calscape (and its stale-data complaints) | Plant pages, Seasons | Built (Seasons) |
| Works with no signal in the garden; changes sync later. | An offline outbox | Everywhere | Built (This month) |
| Talk, then tidy: say it as it comes, get it back as clean text to check. | Wispr Flow | This month (voice notes) | Built |
| A to-scale site plan with each bed in its own colour, tap a bed to see what's in it. | The garden designer's concept plan | Plants (yard map) | Built |

### Avoid

| Rule | Why |
|---|---|
| No red overdue counts or "15 days left" countdowns. | RHS Grow's countdowns read as nagging. Gardening runs on seasons, not deadlines. |
| No treating every plant as a spring annual. | Every planner app does this. Perennials, shrubs, bulbs and fall planting are the core here. |
| No "where to buy" that means one store. | Name the local nursery that actually stocks it. |
| No long setup. | The garden's content is already written; the app opens full. |
| No upsells, ads or ratings prompts. No AI that acts on its own, and no chat: Claude only tidies a voice note, and nothing is saved until you check it. | Two users, no business model yet. AI earns its place only where it saves typing outdoors. |
| No social feed. | GardenTags and Candide died maintaining one. |

## Screens

1. **This month.** A kicker line ("OCTOBER · VICTORIA 9a"), a serif title for the season's theme ("Fall planting window"), then this month and the next two under month headers (more on request), each with Do / Plant / Buy. Tap a card to tick it; press and hold to drag it to another month, where it shows "From Oct". Plant names in the title link to their pages; the small arrow opens the note. **Buy** comes from the Seasons list being shopped for (fall Sep–Nov, spring Feb–May), one card per nursery that opens to its plants; ticking one marks it bought. Chips filter: All · Do · Plant · Buy · Notes. "Plant now" cards: Planned.
   - **Voice notes.** A round fir-green microphone sits above the tab bar (hidden while a card is dragged). Tapping it opens a sheet that listens straight away: the words appear large in Newsreader as you speak, settled words in ink and the guess still forming in muted italic. **Done** sends them to Claude ("Tidying your note…"), which comes back with one or more items to check. Each item has one choice row (Do · Plant · Buy · Note), a month (this one and the next eleven), the text to edit, the plants it links to, and any garden rule it clashes with in the ruled box ("Site 4 is a lean site: no castings."; never blocks saving). "What you said" keeps the raw words. **Save to November** (or **Save 3 items**) is pinned at the bottom; the notice after it has Undo. With no signal or no answer: "Couldn't tidy this without signal. Save what you said as a note in October?" Microphone refused or not supported: the sheet opens on writing instead, with the same tidy.
   - **One-off tasks** from voice notes are ordinary cards (tick, drag, plant links, clear); their note adds "What you said" and **Remove this card**. Imported tasks can't be removed.
   - **Notes** sit after Do / Plant / Buy in their month: serif text with plant names linked, a lichen rule down the side like a margin note, no circle because they aren't ticked, and the initials-and-date chip. The arrow opens "What you said" and **Remove this note**.
2. **Shopping** (was Seasons, renamed October 2026). Fall and spring lists, grouped by nursery. One card per plant with its sites inside ("Great Camas · × 49 · 5 sites"): its circle buys every site at once, and opening it shows each site with its own circle, quantity and editor. Status runs to buy, bought, planted (or skipped).
3. **Plants.** At the top, the **yard map**: the front yard drawn to scale from the designer's plan, street at the bottom, house hatched, driveways and walks flat, trees as circles with a cross (named: maple, Douglas fir, apple, plum, loquat), the swale in water blue, the veg beds drawn inside site 10. Each site has its own colour, grouped by kind: golds and clays for the sun-baked lean sites (1, 4, 7, 9), greens for native woodland (2, 5), plum, grape and soil for fruit and food (3, 6, 10), slate for the side passage (8). Tap a site, or its chip in the row under the map, to choose it: it fills in with a dark outline, the rest fade, and a panel with a stripe in its colour shows its conditions, what to do and not use there, and anything the notes say grows there that isn't in the catalogue. The lists below narrow to that site (in the ground, including plants named in the notes; on the shopping lists). The choice is in the address (`#plants/site/4`), so back works; **Show all** or tapping the site again clears it. Below the map: three sections, each with a line saying what it holds: **In the ground** (marked planted, or in the planting log), **On our shopping lists** (to buy or bought, not planted yet) and **More plants** (the rest of the catalogue), above them a search box and filter chips: **Feeds** (Bees, Butterflies, Hummingbirds, Caterpillars, Humans) and **Good to know** (Full sun, Drought-tolerant, Nesting stems, BC native, Evergreen, Part shade; sun comes from the Sun column in the ranked plant lists). Each plant row shows small icons for who it feeds. A plant page holds, top to bottom: a photo with its credit (or a drawn icon for its kind), common and Latin name, **Feeds** and **Good to know** as small icon chips (pollinators from the notes' Pollinators column; BC native, drought-tolerant, edible and so on from the notes; size), **Why it's here** as short bullets, the 12-month bar with a legend, **Planting it** as one Do line and one Don't-use line (the full rules, with reasons and sites, one tap away), **Shopping and planting** as one plain line per season and nursery, and the planting log.
4. **Pollinators** (was Pollinator picks; renamed October 2026, since "pick" was never explained). Title "Pollinator plants". The year ring sits at the top: the outer band is the rubric's critical windows (Dec–Mar winter, Feb–Apr emerging queens, Oct–Dec late season). In **Our garden**, each month's petal counts every plant of ours that flowers then, ranked or not: solid salmonberry for what's in the ground (planted, logged, or named in a site's notes), and a lighter dashed extension for what's planned (to buy or bought). **All pollinator plants** shows the ranking instead. Every month is tappable (the current month is chosen to begin with): it's outlined, the centre shows "N in flower / N planned", and a panel below (pollen-coloured stripe in a critical month) lists **In flower now**, **Planned** with its season and status, and in a critical month or a gap, **Could add**: the top ranked plants that flower then that we don't have. A gap reads "Nothing of ours flowers in December, when pollinators need it." Plants of ours with no flowering months in the notes are named, so an empty month isn't mistaken for a real gap. The month list below is the text version; each row picks the same month. The choice is in the address (`#pollinators/month/12`). Below: the ranking (all 48 plants of `perennial-flowers.md`, by support for threatened species, then the threat-status tiebreaker), with a line saying what it is.

Bottom navigation: Month · Shopping · Plants · Pollinators.

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
| `--pollen` | `#b8860b` | Ochre: pollinator-use row on the 12-month bar, year ring arcs |

### Dark

Warm charcoal, not black. Starting values: `--bg #1a1c18`, `--surface #23261f`, `--ink #ece8dc`, `--muted #a9ac9e`, `--line #3a3d33`, `--accent #7fb08f`, `--lichen #4a5640`, `--bloom #e58a72`, `--pollen #e0b64a`. Light is the default; dark is a choice in Settings.

### Measured contrast

| Pair | Light | Dark |
|---|---|---|
| Ink on lichen ("done by" initials) | 6.81 | 6.36 |
| Muted on surface (task details, dates) | 6.38 | 6.64 |
| Accent on accent-soft (selected tab, swipe hint) | 6.11 | 4.85 |
| Pollen on surface (bar fill, a graphic: 3:1 minimum) | 3.20 | 8.01 |
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
- Say what's here, not how it got here: "Planted in our garden.", not "Planted: marked planted on a shopping list, or recorded in a plant's planting log." How to change it belongs in the empty state.
- Say "pollinator plants", never "picks": the notes' word for the ranked list means nothing to someone who hasn't read them.
- The notes' naturalist shorthand is shown in plain words ("bumblebee", not "Bombus"; "mint-family", not "Lamiaceae"); the notes keep their own wording.

## Open decisions

None right now.

## Also decided (2026-10-03)

- **Photos:** none at first (2026-10-03); changed 2026-10-06 to Wikimedia Commons thumbnails (330 px, about 50 KB each) on plant pages, credited with author and licence, loaded only when a page opens and kept on the phone once viewed (up to 150). Taken from the notes' links where there is one, otherwise from the Wikipedia page for the species; the importer reports plants with no photo, which show an icon for their kind.
- **"Done by" label:** initials.
- **Pollen colour:** ochre (`#b8860b` light, `#e0b64a` dark), chosen when plant pages were built. It is close to salmonberry in lightness but a different hue, and every bar row is labelled, so colour is never the only cue.
