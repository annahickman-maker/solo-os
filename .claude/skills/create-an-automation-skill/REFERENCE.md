# Create an Automation Skill - reference

The detail behind the setup. Read the parts you need for the automation you are building.

## Trigger types

| Trigger | What it means | Wired by |
|---|---|---|
| Event | Something lands - a new call recording, a new transcript, a new file | a watcher (background agent) that detects the thing and runs the skill |
| Schedule | A time comes around - daily or weekly at a set time | a LaunchAgent on a calendar interval |

`automate-task` writes the `schedule` block into the new skill and sets up the watcher or LaunchAgent the first time. This skill's job is to write the automation skill itself; `automate-task` makes it run.

## Pulling a Zoom transcript (the proven event recipe)

For "a new call recording lands," the automation reads the recording's transcript with the Zoom MCP. No YouTube-style API key needed - it uses the connected Zoom account.

1. `search_meetings` over a recent date range. Filter in code to `has_recording: true` (do not use `recordings_list` - it returns 500).
2. `get_recording_resource` with `types: "transcript"` only - skip video and audio (calls are filmed on OBS). Pass `meetingId` = the `meeting_uuid` from search.
3. Transcripts can be 100k+ chars and may auto-save to a tool-results file - read in chunks if so.
4. If the transcript is empty or still processing, stop and leave it for the next run - do not produce a half output.
5. Convert the JSON timeline to plaintext with:
   `jq -r '.transcripts[0].timeline[] | "[\(.ts)] \(.display_name): \(.text)"'`

## Classifying one trigger into several automations

When one event can feed more than one automation - a Q&A call and a strategy call both arrive as "a new recording" - the **router** decides which skill to fire. Classify on the meeting `topic` (case-insensitive):

- Contains `q&a`, `qa`, `community call`, `office hours` -> the Q&A automation
- Anything else -> the strategy / client automation

If the topic is genuinely ambiguous, scan the first ~500 words: several attendees asking questions in sequence reads as Q&A; two people in a focused conversation reads as strategy. When still unsure, default to the strategy automation (a misfiled Q&A spams the community folder, which is worse).

A skill run on demand can self-guard the same way: pull the latest recording, check the topic matches its own type, and bail if it does not.

## Worked examples (two automations built with this)

### Skool Q&A Post

- **Fires when:** a new Q&A / community call recording lands.
- **Does:** writes a community recap post - a one-line context plus bolded-question headline bullets that mirror how each question went - and drops it in the inbox.
- **Lands in:** `05_Assets/Transcripts/QA-Calls/Skool Q&A {Nth} {Month}.md` (+ a raw sibling).

### Client Strategy Summary

- **Fires when:** a new client / strategy call recording lands.
- **Does:** drafts a ready-to-send recap email to the other person (what you landed on, the open question, what they should sit with, your action items), saves it, drafts it in Gmail, and pings Telegram.
- **Lands in:** `05_Assets/Transcripts/Client-Calls/{Name} call {Nth} of {Month}.md` (+ a raw sibling).

Both are single-job automations fed by the same "new recording" event, with the router classifying by topic. Copy either as the starting shape for a new one.
