# Demo walkthrough

A 10-minute script for showing the system to someone. Every asset tag, employee
name and number below is **real data in the seeded database** — you can follow
this verbatim.

> Adapt freely. The one thing worth keeping is the order: it builds from "here's
> what it does" to "here's the idea that makes it different" to "here's why you
> can trust it".

---

## Before you start

**1. Wake the server.** On the free tier, Render sleeps after 15 minutes idle
and takes about a minute to wake. Open the site yourself a couple of minutes
before you present, or the first thing your audience sees is a spinner.

**2. Have two browser tabs ready:**
- Tab 1 — the app, already signed in as `admin@example.com`
- Tab 2 — the API docs at `/api/docs` (only if your audience is technical)

**3. Know your one-sentence opener.** Something like:

> *"A company hands out laptops. Six months later somebody asks who had this one
> in March. That question is surprisingly hard to answer, and this is a system
> built so it's always answerable."*

---

## Part 1 — The shape of it (1 min)

**Land on the Dashboard.**

Point at the tiles and say what the system is tracking: 200 assets, 60
employees, and — the important one — **66 open assignments against 60 assigned
assets**.

> *"Those numbers don't match on purpose. Six of those laptops are away for
> repair but still assigned to the person who had them, because it's still their
> machine and it's coming back. The system doesn't pretend otherwise."*

That's a good early signal that the model is thought through rather than
generic.

Mention the warranty tiles (expiring in 30 / 60 / 90 days) and the greyed-out
nav items — Stock, Purchases, Repairs, Reports — so people can see the intended
shape without you overclaiming what's finished.

## Part 2 — Finding things (1 min)

**Go to Assets.**

- Search `LAP-0031` → one result.
- Clear it, filter **Status → Assigned** → the holder column fills in.
- Change the filter and point out the URL changing.

> *"Filters live in the URL, so any view you're looking at is a link you can
> paste to a colleague."*

- Click **Export CSV** if you want — it exports whatever is filtered, not
  everything.

## Part 3 — The core idea (3 min) ⭐

This is the part worth slowing down for. Everything else is competent CRUD; this
is the bit that's actually a design decision.

**Open `LAP-0002`.**

Header shows the tag, status, condition, and *Held by Siddharth Banerjee since
31 Jul 2025*.

**Click the History tab.** Eleven events, newest first.

Scroll down through it and narrate:

> *"This laptop has had four different holders. Every issue, every return, every
> inspection is here — who did it, when, and what condition it was in each time.*
>
> *Now, the obvious way to build this is a column on the asset saying who has it.
> But the moment this laptop moved from one person to the next, you'd overwrite
> that column — and the previous holder would be gone. Not archived. Gone.
> Answering 'who has it now' would have destroyed the answer to 'who had it
> then'.*
>
> *So the holder is never stored. There's a separate ledger with one row per
> 'this person held this asset from this date to that date'. The current holder
> is whoever's on the row that's still open. Handing it on doesn't overwrite
> anything — it closes one row and opens another."*

**The payoff line:**

> *"Everything else in the system follows from that. Employees are never deleted,
> only archived, because deleting one would orphan every row pointing at them.
> The event log can't be edited — there's a database trigger that refuses. The
> whole job of this system is to not forget things, so nothing in it is allowed
> to forget."*

## Part 4 — The lifecycle, live (3 min)

Now do a real transaction in front of them.

**Open `LAP-0031`** (in stock, Dell Latitude 5440).

**1. Issue it.** Click **Issue** → type-ahead an employee → pick a condition →
note the summary box at the bottom of the dialog spelling out what's about to
happen → **Issue asset**.

Status flips to *Assigned*, the holder line appears.

**2. Try to issue it again.** Click **Issue** — it's **disabled**, with a tooltip
saying *"Already held by …"*.

> *"The buttons come from the same allow-list the API enforces. You're not
> allowed to do something invalid and find out afterwards."*

**3. Return it.** Click **Return** → record a condition, say **Fair** → submit.

Status becomes **Awaiting inspection** — *not* In stock.

**This is the moment to pause on:**

> *"Notice it didn't go back into stock. A returned laptop always lands in
> 'awaiting inspection' and stays there until someone explicitly looks at it.
> There is deliberately no path from assigned straight back to stock.*
>
> *Because the alternative is somebody being handed a laptop with a cracked
> screen and the last employee's data still on the disk."*

**4. Try to issue it now.** Click **Issue** — disabled again, tooltip says it
must be inspected first.

**5. Inspect it.** Click **Inspect** → outcome **Passed — return to stock** →
condition **Good** → submit. Now it's back In stock and issuable.

**6. Open the History tab.** All four events you just created are there, in
order, with your name against them.

> *"Four actions, four permanent records. Nothing I just did can be edited or
> deleted by anyone, including me."*

## Part 5 — Exit clearance (2 min)

**Go to Employees → search `Sameer Khan`** (EMP1016 — holds two assets).

The clearance panel is red: **Exit is blocked**, listing both items with how
long he's held them.

The **Mark as exited** button is **disabled**.

> *"You cannot offboard someone while they still have company hardware. Each
> item has to be returned, or explicitly written off by an admin with a reason."*

**Click Write off** on one item to show the dialog — read the consequence box
aloud:

> *"It closes the assignment with no return date and no return condition,
> because nothing actually came back. And it says right here: he stays on that
> asset's history as its former holder."*

You can cancel rather than actually doing it.

**Then show the other side — search `Rahul Reddy`** (EMP1056, already exited).

> *"This person left the company in August. His record is still here, marked
> exited. And `MON-0045` — the monitor he never returned — still shows him in
> its history. That's the whole point: the trail survives the person leaving."*

## Part 6 — Roles (1 min, optional)

Sign out, sign in as `viewer@example.com` / same password.

Open any asset. **Every action button is visibly disabled**, each with a tooltip
explaining the role needed.

> *"Read-only is enforced on the server, not just hidden in the UI — the endpoint
> returns a 403. But the UI tells you why rather than just hiding things, so
> people aren't left wondering where a button went."*

---

## The "prove it" moments

If your audience is technical, these land well.

**1. Two people issuing the same laptop simultaneously.**

> *"Two requests can both check 'is this free?', both get yes, and both try to
> insert. So there's a partial unique index in Postgres that only permits one
> open assignment per asset. The loser fails at the database, and the API turns
> that into a clean 409 — not a 500. There's a test that fires both requests
> genuinely in parallel and asserts exactly one wins."*

**2. The audit trail can't be edited.**

> *"There are BEFORE UPDATE and BEFORE DELETE triggers on the event table. Not
> application code — the database itself refuses. If a future bug tries to
> rewrite history, it gets an error instead."*

**3. Show the API docs** (`/api/docs`) if they'd find that interesting — every
endpoint is generated from the same Zod schemas the frontend validates against.

**4. The test count.** 223 passing: 121 unit, 102 integration against a real
Postgres container. The state machine suite covers all 42 status pairs, not a
sample.

---

## Questions you'll probably get

**"What about chargers and mice — do you track each one?"**
No. Categories are either `SERIALIZED` (one row per unit, full history — laptops,
monitors) or `BULK` (a count per model per location — chargers, mice). The bulk
side is Phase 5; the categories already exist.

**"Can I see how much we've spent on repairs?"**
That's Phase 6. The schema is designed for it — money is stored as integer paise,
never floats, and repair tickets link to both the asset and the vendor.

**"What happens if someone makes a mistake?"**
You add a correcting event explaining it. You never edit the old one — the
database won't let you. Serial numbers can be corrected by an admin, and the
correction records both the old and new value.

**"Is this production-ready?"**
Three of eight phases. The lifecycle, audit trail and exit clearance are done and
tested. Procurement, bulk stock, repairs, reports and CI are not. The free
hosting tier is fine for a demo but has no backups — the moment it holds real
data it needs a paid database with point-in-time recovery.

**"How long did this take?"**
Be honest, and point at the phase table in the README.

---

## If something goes wrong

| Symptom | Cause | What to say / do |
|---|---|---|
| Site loads, spinner forever | Render is waking up | *"Free tier, it sleeps when idle"* — wait ~60s |
| Login fails | Wrong password, or DB asleep | Neon wakes in ~1s; try once more |
| A screen is empty | Seed hasn't run on that environment | Fall back to the local instance |
| Nav item does nothing | It's a later phase | It's greyed out on purpose — say so |

**Keep a local instance running as a backup.** If the hosted demo misbehaves,
`pnpm dev` on your laptop is identical and has no cold start.

---

## Cheat sheet

| | |
|---|---|
| Sign in | `admin@example.com` |
| Richest history | `LAP-0002` — 11 events, 4 holders |
| In stock, safe to issue live | `LAP-0031`, `LAP-0032` |
| Awaiting inspection | `DOCK-0023`, `DOCK-0024` |
| Blocked exit clearance | `Sameer Khan` (EMP1016), `Meera Bhatt` (EMP1030) |
| Already exited, kit written off | `Rahul Reddy` (EMP1056) → `MON-0045` |
| In repair but still held | `MON-0039` → Naveen Khan |
| Read-only account | `viewer@example.com` |
