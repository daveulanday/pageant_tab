# Pageant Score Tabulation System — User Manual

## Project Overview

The Pageant Score Tabulation System helps an organizer set up a pageant, enter judges’ scores, calculate standings, advance contestants through rounds, and prepare final tabulation sheets. It runs in a current web browser and saves the active event in that browser on the current device. It does not require an internet connection or a server.

Scores are entered from **0 to 100** for each criterion. A contestant’s criterion scores are weighted to make a category score; the category scores are then weighted to make that round’s score. Criterion weights in a category and category contributions in a round must each total **100%**. A contestant’s score from an earlier round does not carry into a later round. Earlier rounds determine advancement; the highest score in the final round wins.

Use **Backup and restore** to download a JSON backup regularly. Browser storage is local to this device and browser, so a backup is needed to move the event or recover it elsewhere. The optional chairperson PIN helps prevent accidental changes on a shared screen; it is not strong security.

## Parts & Labeling

| Screen or control | What it is for |
| --- | --- |
| **Overview** | Event dashboard showing contestant and judge counts, category count, score completion, setup checklist, shortcuts, and a current standing preview. **Continue setup** jumps to the next unfinished setup item. |
| **Event setup** | Enter and save the pageant name, date, and optional location. Also contains the optional chairperson PIN and **Reset all contest fields**. |
| **Contestants** | Add and manage contestants. Each needs a unique entry number and a name. Search by number or name. |
| **Judges** | Add and manage the judging panel. Each judge added here is available for score entry. |
| **Rounds** | Define competition stages, their order, how many contestants advance, and any tie-break order. Use **Move up** and **Move down** before finishing a round. Later rounds remain unavailable until earlier rounds are finished. |
| **Categories and criteria** | Define what judges score. Each category belongs to a round and has weighted criteria. **Round to edit** filters the screen to one round. Criterion weights total 100% within a category; category contributions total 100% within a round. |
| **Quick setup** | Wizard on the Rounds or Categories screen for creating several rounds, categories, and criteria in one setup flow. Review the suggested weights before saving. |
| **Score entry** | Choose a round, category, and criterion, then enter the score grid. Contestants are listed by row and judges by column. Scores must be from 0 to 100. |
| **Save & next** | Saves the current score grid and opens the next criterion or category in that round. |
| **Save & view rankings** | Saves the current grid and opens Results for the selected round. |
| **Lock sheet / Unlock sheet** | Locks a completed judge/category sheet to prevent edits, or reopens it. Unlocking requires a reason. A finalized round’s sheets remain locked until the round is reopened. |
| **Results** | Shows rankings by round, category winners, score progress, and the detailed standings. Select a round, **Standings** or **By judge**, and a category or round total. |
| **What is missing** | Lists incomplete scoring sheets and invalid or incomplete weights that prevent final rankings. |
| **Finish round & proceed to next / Finish final round** | Finalizes a round after required scores and weights are complete. The next round then opens for only the advancing contestants. |
| **Print tabulation sheet** | Prints the selected round/category or total with event information, scores, cutoff rule, signature lines, and print time. Choose the desired round, view, and category first. |
| **Export … CSV** | Downloads standings, by-judge scores, raw scores, or the audit log as a CSV file. |
| **Audit log** | Shows recorded changes newest first. Use its type filter and search field to find entries; export it from Results if needed. |
| **Backup and restore** | **Download JSON backup** saves a portable copy. **Restore JSON backup** loads a selected copy and replaces the event currently stored in this browser. |
| **Help** | Opens the in-app step-by-step guide with shortcuts to the setup and scoring screens. |

### Scoring and ranking terms

- **Criterion**: One scored element within a category, such as stage presence or interview.
- **Criterion weight**: How much a criterion contributes to its category score.
- **Category contribution**: How much a category contributes to its round score.
- **Advance count / cutoff**: The number of contestants intended to move from one round to the next.
- **Provisional rank**: A rank based on incomplete scores or weights. Final rankings require every judge’s score for every criterion and valid 100% weights.
- **Tie-break order**: Ordered rules for resolving equal final scores: a category score, `firsts` (first-place judge ranks), or `rankSum` (judge rank sum). Any tie that remains unresolved shares a place unless the committee records a decision.

## How to use

### 1. Open the system

Open `index.html` in a current browser. The app stores the event in that browser on that device. Before using a different browser or device, download a JSON backup from **Backup and restore** and restore it there.

### 2. Set up the event and roster

1. On **Event setup**, enter the pageant name, date, and optional location, then select **Save event details**.
2. In **Contestants**, add every contestant with a unique entry number and name.
3. In **Judges**, add every judge who will score the event.

### 3. Set up rounds and scoring

1. Open **Rounds** and select **Quick setup** to create your stages, or use **Add round**. Arrange rounds in scoring order and set an advance count for each non-final round. Leave the final round’s advance count blank.
2. Add categories and criteria, assigning each category to its round. You can do this in Quick setup or on **Categories**. Set criterion weights within each category to total 100%, and category contributions within each round to total 100%.
3. Enter the ordered tie-break rules on a round if the event requires them. A category name, `firsts`, and `rankSum` are supported.
4. Review the round list and contributions. Do not change round order after finishing a round.

### 4. Enter scores

1. Open **Score entry**. Select a round, category, and criterion.
2. Enter each contestant’s score in the judge columns. Enter values from 0 to 100.
3. Select **Save & next** to save and continue through the next criterion/category, or **Save & view rankings** to save and review Results.
4. Repeat until every judge has scored every criterion for every contestant in the current round. A sheet can be locked once its scores are complete; locked fields are read-only. Unlocking requires a reason of at least five characters.

### 5. Review results and advance contestants

1. In **Results**, select the current round and review **Rankings for this round**. Check **What is missing** and resolve all incomplete sheets or invalid weights.
2. Review the standings and any ties. Scores are compared to two decimal places; displayed competition places can be `1, 1, 3` when contestants share first place.
3. If a tie falls on the advancement cutoff, enter exactly enough contestant entry numbers from the tied group to fill the remaining advancing places, then save the cutoff decision.
4. For an unresolved shared place, enter the committee’s order and a decision note where prompted.
5. Select **Finish round & proceed to next**. The app finalizes the round and makes only the advancing contestants available in the next round. Repeat score entry and review for each round. On the last round, select **Finish final round**.

### 6. Save and share the outcome

1. Download a JSON backup from **Backup and restore**, especially before moving the event to another device or browser.
2. In Results, choose the round, view, and category or total, then select **Print tabulation sheet** to print.
3. Use the CSV export buttons for standings, by-judge scores, raw scores, or audit history.

### Start a new contest

Select **Reset contest** in the sidebar or **Reset all contest fields** in Event setup. The reset dialog offers a backup download. To proceed, type `RESET` and confirm. This clears the current event’s details, contestants, judges, categories, and scores.
