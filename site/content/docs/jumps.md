---
title: Conditional jumps
group: Build a sequence
description: Repeat a phrase, take a detour, or let chance choose the next step.
order: 6
---

## Add a jump {#add-a-jump}

Select a step, then choose **+ Jump rule** beside **+ Add note**. Set a rule and a destination. Use the crosshair to pick a destination directly from the grid. Each step can have one jump.

When the rule passes, playback moves to the destination. When it fails, it follows the normal route or the **normal** step you specify. Use **X** to remove the jump.

![This step jumps to step 1 half the time and otherwise continues normally.](/screenshots/step-editor.png)

## Jump rules {#rules}

| Rule | Passes when… |
| --- | --- |
| Always | Every visit. |
| 1x–7x | The chosen number of visits pass, then one fails. The cycle repeats. |
| 2:2–8:8 | The last visit in each group of two to eight arrives. |
| 10%–90% | A new chance check succeeds at the selected probability. |
| Last | The last jump attempted passed. |
| Not last | The last jump attempted failed. |

For a simple variation, give the end of a phrase a **50%** jump back to its start. Some passes repeat the phrase; others continue to the next section.

## Read jumps in the grid {#read-the-grid}

A jump has two dots in the same color: one at the source's top right and one at the destination's bottom left. Follow the pair to see its route. Several pairs can coexist across the grid.

![The matching colored dots connect a jump's source and destination.](/screenshots/grid.png)

