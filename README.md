# Pageant score tabulation

A browser-only pageant tabulation app built with plain HTML, vanilla JavaScript, and a locally compiled Tailwind CSS v4 stylesheet. Open `index.html` directly from disk (`file://`). It uses local storage for the active event and does not need a server, runtime packages, CDN, or network connection.

## Run and build

Open `index.html` in a current browser. Use **Backup and restore** to download a JSON copy before moving the event to another browser or device.

`styles.css` is generated. Make style changes in `src/input.css`, then run the standalone Tailwind v4.3.3 CLI from the project folder:

```powershell
.\tools\tailwindcss.exe -i .\src\input.css -o .\styles.css --minify
```

The executable can be obtained from the Tailwind v4.3.3 release if it is missing. It is used only at build time; browsers load the generated static stylesheet.

## Run tests

The tests use Node's built-in test runner and have no package dependencies:

```powershell
node --test .\tests\*.test.js
```

The browser app itself does not require Node.

## File structure

```text
CHI System/
  index.html                  Screens and semantic markup
  app.js                      Browser UI, local storage, and event workflows
  scoring.js                  UMD scoring, ranking, migration, and CSV helpers
  styles.css                  Generated static CSS (do not edit by hand)
  README.md                   Build and operator guide
  src/
    input.css                 Tailwind v4 theme, components, and print rules
  tests/
    scoring.test.js           Built-in node:test coverage
  assets/
    archivo-variable.ttf      Self-hosted Archivo font
    archivo-OFL.txt           Font license
  tools/
    tailwindcss.exe           Tailwind v4.3.3 standalone Windows CLI
```

## Data model and migration

The local storage key remains `pageant-score-tabulation-v1` so existing installations are found. The saved object is version 2 and contains:

- `event`, `contestants`, and `judges` records.
- Ordered `rounds`, each with a name, optional `advanceCount`, an ordered `tieBreakers` list, and finalization metadata.
- `categories`, each assigned to one `roundId`, with its category contribution within that round and weighted criteria.
- `scores`, using the unchanged key format `contestantId|judgeId|categoryId|criterionId`.
- `locks`, `tieDecisions`, append-only `audit`, `lastBackupAt`, and optional salted SHA-256 PIN data.

Opening a v1 event or restoring a v1 backup migrates it in memory to v2, then saves the migrated form. The migration creates one **Main round** with no cutoff, assigns every old category to it, preserves the old category weights and valid scores, and starts with an empty audit list. Unsafe IDs are replaced with generated safe IDs and the associated score keys are remapped. Scores outside 0–100 or scores that refer to unknown records are dropped and counted in the restore message.

## Scoring, rounds, and ties

Each criterion score is weighted within its category. A category score is the mean of that contestant's complete judge scores. A round score combines that round's category scores using category contribution percentages. Criterion weights within each category and category contributions within each round must total 100%. Scores from an earlier round do not carry forward: earlier rounds only determine who advances, and the highest score in the final round wins.

Enter a round's optional advance count to set its cutoff. Rounds must be finished in order: later rounds stay locked until every earlier round is finished. Finishing requires complete scores and valid weights. If a tie falls on the cutoff, the committee chooses exactly enough contestants from the tied entries to meet the advance count; only the configured number moves on. Round order in the **Rounds** screen is the advancement order.

Use **Quick setup** on the Rounds screen to create several rounds, categories, and criteria in one pass. Use **Move up** and **Move down** to set their order before finishing any round. Review and adjust the proposed category contributions before saving. Each round card shows how many contestants are ready and has a **Score this round** button. If a round's contribution total is not 100%, choose **Set contributions to 100%** on its card; this rescales the existing category shares proportionally, or splits them evenly if all are zero. For later rounds, contestants appear in Score entry only after the preceding round is finished; if a cutoff tie occurs, record the exact advancing list on Results first. **Finish round & proceed to next** opens Score entry with only the advancing contestants.

In **Score entry**, choose a round, category, and criterion. The grid has contestants as rows and judges as columns. **Save & view rankings** stores the current grid and opens Results at that round. **Save & next** stores it and selects the next criterion or category. At the last grid, the app says there are no more grids in that round. Results shows a separate **Rankings for this round** section for each round; later rounds say which earlier round must be finished before their rankings open. After all scores are complete, choose **Finish round & proceed to next**. The next round opens in Score entry with only the configured advancing contestants.

Final scores are compared at two decimal places, the same precision used for display. Competition places use `1, 1, 3`. An ordered tie-break list accepts a category name, `firsts`, or `rankSum`. Category score and judge-rank rules apply only to complete contestants; unresolved ties share a place. Record committee orders and a note on Results when a tie needs a manual decision.

The Results round selector changes the active standings. **Standings** shows the round total or a category. **By judge** shows judge scores and ranks with average, final rank, and column totals. **What is missing** names incomplete weights and judge/category sheets.

## Locking, finalizing, and audit history

Use **Lock sheet** in Score entry after every contestant in that round has all criteria scored for the selected judge and category. Locked inputs are disabled. Unlocking and unfinalizing require a reason of at least five characters. Finalizing a round requires complete sheets, valid weights, and (after round one) a finalized prior round; it saves a rank/score snapshot and locks the round's sheets. Shared places require explicit acceptance.

The Audit log records score saves and clears, record changes, locks, finalization, committee decisions, event settings, backups, restores, and contest resets. Entries appear newest first and cannot be edited in the UI. The optional chairperson PIN is stored as a salted SHA-256 hash. It helps prevent accidental changes on a shared screen; it is not strong security because event data lives in this browser. If `crypto.subtle` is unavailable, the PIN controls are hidden.

**Reset all contest fields** opens a dialog, offers a backup download, and requires typing `RESET`. The sidebar shows the last backup time and marks it for attention when there are unsaved changes and the backup is missing or older than 30 minutes. The app requests persistent browser storage and ignores unsupported or denied requests.

## Print and CSV

Choose a round, category or round total, and view before selecting **Print tabulation sheet**. Printed output includes event details, the round and category, a final/provisional label, scores to two decimals, a cutoff rule, judge signature lines, tabulator and chairperson lines, and a print timestamp. Print styling uses landscape paper, repeated table headers, and a solid black cutoff rule.

CSV exports are generated in the browser for standings, by-judge scores, raw scores, and the audit log. Files use a UTF-8 BOM, CRLF rows, quoted cells, and neutralize spreadsheet formulas that begin with `=`, `+`, `-`, or `@`.

## Step-by-step operator guide

1. Open **Event setup** and enter the pageant name, date, and location.
2. Add every contestant with a unique entry number, then add every judge.
3. Open **Rounds** and choose **Quick setup**. Add any new rounds, then add categories and criteria and assign them to rounds. Set the order with **Move up** and **Move down** before finishing a round. On **Categories**, use **Round to edit** to view and manage one round’s categories at a time. Review the proposed equal weights, adjust if needed, and save.
4. In **Score entry**, choose a round, category, and criterion. Enter each contestant's score across the judge columns. Locked judges' columns are read-only. Select **Save & view rankings** to store the grid and open that round's Results, or **Save & next** to move to the next criterion or category.
5. In **Results**, review the **Rankings for this round** sections and check **What is missing**. For a tie at the advance cutoff, choose exactly enough tied contestants to fill the remaining places.
6. After all scores are complete, resolve any cutoff tie and choose **Finish round & proceed to next**. The round locks, its configured number of top contestants advance, and Score entry opens the next round with only those contestants. For the final round, choose **Finish final round**. Repeat steps 4–6. Download a JSON backup, then print tabulation sheets or export CSV files as needed.

The **Help** button in the app contains the same sequence with shortcuts to each screen. On **Overview**, use **Continue setup** to jump to the next unfinished setup item.
