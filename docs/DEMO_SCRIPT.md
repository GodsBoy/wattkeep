# WattKeep timed demo script

Target length: 160 seconds. The script is designed to fit within the three-minute challenge window while showing the inspect, compare, stage, review, human commit, undo, stale rejection, recovery, and discard story.

## Before the timer

- Start the app in a fresh session with the canonical forecast visible.
- If a WebMCP host is available, confirm that the page reports eight tools registered. Otherwise use the complete manual interface. The product story and safety boundary are the same in both modes.

## Timed beats

| Time | Beat | Action and narration |
| --- | --- | --- |
| 0:00 to 0:10 | Frame the problem | Show the WattKeep headline and say: "This is a local outage plan for the Morgan household. You decide what must stay on, and WattKeep makes the stored energy last." Point out that no account or device connection is required. |
| 0:10 to 0:25 | Inspect | Call `inspect_home` and `inspect_outage`, or point to the status rail. Say: "The battery is 13.5 kWh, starting at 10.53 kWh, with a 2.70 kWh reserve. The outage runs from 18:00 to 06:00 in 12 hourly intervals." |
| 0:25 to 0:55 | Compare and explain | Select all three plans and run the comparison, or call `simulate_plan` for the plans followed by `compare_plans`. Show Essential Reserve at 8.09 kWh, Balanced Night at 6.97 kWh, and Comfort Carry at 0.67 kWh with its first breach at 02:00 to 03:00. Select Comfort Carry and call `explain_interval` for interval 8, or click the matching timeline control, to show the solar, load, and reserve accounting. Select Balanced Night as the candidate. |
| 0:55 to 1:15 | Stage and request review | Stage Balanced Night with `stage_plan`, or click Stage selected plan. Show the Proposal desk with its immutable Before Essential Reserve and After Balanced Night diff. Call `request_review`, or click Request review, and show the Review and commit control. |
| 1:15 to 1:25 | Human commit boundary | Stop before activating confirmation and say: "This is the human commit boundary. The agent has only prepared and requested review. There is no `approve_plan`, `commit`, or `undo` tool. No committed policy changes until I, the person, open this control and confirm it." |
| 1:25 to 1:40 | Human commit | Click Review and commit. Read the current policy, new policy, reserve target, and revision in the dialog. Click Confirm commit. Show Committed Balanced Night, revision r2, and the journal entry. |
| 1:40 to 1:50 | Human undo | Click Undo latest change. Show Essential Reserve restored at the next revision and the Commit undone journal entry. Say: "Undo is also a human UI action, not a page tool." |
| 1:50 to 2:10 | Stale rejection | Stage and review Balanced Night again. Before opening confirmation, click the visible Refresh forecast control. Show that the proposal is stale, the previous Review and commit action is unavailable, and the exact proposal ID is named for recovery. Say: "The workspace changed after review, so this proposal cannot be applied. The automated safety test also proves that an already-open confirmation becomes disabled." |
| 2:10 to 2:40 | Recover and discard | Use Restage exact proposal, which reruns the plan against the new forecast and preserves the exact proposal identity check. Request review again, then choose Discard proposal. Show No active proposal and confirm that the committed policy did not change. Close with: "Every route is visible, recoverable, and still waits for a person before applying a policy." |

## Short presenter notes

- Keep the plan cards and Proposal desk on screen long enough for the end-energy values and Before and After labels to be read.
- Use the interval evidence panel to make the Comfort Carry breach concrete rather than describing it as a hidden calculation.
- At the human commit boundary, leave a clear pause before clicking Review and commit. This is the safety point the audience should remember.
- If WebMCP is unavailable or registration fails, say so once and continue with the manual controls. Manual mode is a complete product path, not an error state.
- Do not claim a live deployment or challenge submission in the recording. Those are tracked separately in [docs/SUBMISSION_NOTES.md](SUBMISSION_NOTES.md).
