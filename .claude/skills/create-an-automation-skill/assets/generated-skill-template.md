<!--
  GENERATED-SKILL TEMPLATE
  Create an Automation Skill fills the <<...>> tokens and writes the result to
  .claude/skills/<<SKILL_SLUG>>/SKILL.md in the user's vault. Then automate-task
  wires the schedule + background agent.

  Tokens to fill:
    <<SKILL_SLUG>>         kebab-case id, e.g. skool-qa-post
    <<SKILL_TITLE>>        e.g. Skool Q&A Post
    <<SKILL_CARD>>         one-line card for the Skills page
    <<SKILL_DESCRIPTION>>  what it does + "Use when ..." (one line, third person)
    <<SKILL_CATEGORY>>     Meta | Research | Ideas | Create | Strategy | Clients
    <<ICON>>               youtube|instagram|image|web|copy|research|ideas|strategy|clients|meta
    <<TRIGGER_EVENT>>      the event slug that fires it, e.g. new-zoom-recording
    <<TRIGGER_DESC>>       plain-language trigger, e.g. a new Q&A call recording lands
    <<ACTION>>             the one job, in plain language
    <<OUTPUT_TYPE>>        inbox|project|transcript|content|tasks
    <<OUTPUT_DESC>>        where the result lands
    <<READS>>              files/paths the skill reads (comma-separated)
    <<WRITES>>             path(s) the skill writes, with the naming convention
-->
---
name: <<SKILL_SLUG>>
title: <<SKILL_TITLE>>
card: <<SKILL_CARD>>
description: '<<SKILL_DESCRIPTION>>'
category: <<SKILL_CATEGORY>>
inputs:
  - type: transcript
    multiple: true
    optional: true
outputs:
  - type: <<OUTPUT_TYPE>>
    description: <<OUTPUT_DESC>>
schedule:
  trigger: event
  event: <<TRIGGER_EVENT>>
  output: <<OUTPUT_DESC>>
  enabled: true
icon: <<ICON>>
knowledge: <<READS>>
---

# <<SKILL_TITLE>>

Runs on its own when <<TRIGGER_DESC>>, or on demand. One job: <<ACTION>>.

## Get the input

If a transcript was handed to this run (the watcher or the run panel passed one), use it. If it fired with nothing provided, pull the latest matching item yourself - see the Zoom-transcript recipe in `create-an-automation-skill/REFERENCE.md`. If it does not match this automation's type, leave it alone. If it is empty or still processing, stop and leave it for next run.

## Do the job

<<ACTION, written out as concrete steps>>

## Save the output

Write to <<WRITES>>. Show the full result in the chat too - never just point at the file.

## Rules

- No em dashes anywhere. Hyphens only.
- Read `01_Core/core_voice-style.md` before writing anything in the user's voice.
