---
name: write-a-skill
description: 'Create new agent skills with proper structure, progressive disclosure, and bundled resources. Use when the user wants to create, write, or build a new skill, when adding a skill to Solopreneur OS or any client vault, or when documenting a methodology so Claude can apply it consistently.'
title: Create a Skill
card: Create a reusable skill you can run with Claude
category: Meta
---

# Writing Skills

Canonical standard for every skill written for this vault, Solopreneur OS, OS Builds clients, and channel vaults. Read this before writing any new skill.

## Process

1. **Gather requirements** - the task, when it should trigger, any vault data it reads, any other skills it composes, and whether it needs scripts.
2. **Draft the skill** - `SKILL.md` (under 100 lines), plus `REFERENCE.md` / `EXAMPLES.md` / `scripts/` only if needed.
3. **Review with the user** - confirm coverage before finalising.

## Skill structure

```
skill-name/
├── SKILL.md           # Required, under 100 lines
├── REFERENCE.md       # Optional - detailed docs
├── EXAMPLES.md        # Optional - usage examples
└── scripts/           # Optional - utility scripts
```

## SKILL.md frontmatter

The frontmatter is the single source of truth - it travels with the file and the dashboard reads every field. Set all of it.

```md
---
name: skill-slug              # invocation id - kebab-case, never rename on edit
title: Display Name           # shown on the Skills page
card: one-liner under the title
description: what it does + "Use when [triggers]"   # Claude reads this to auto-apply it
category: Meta | Research | Ideas | Create | Strategy | Clients
hidden: true                  # optional - composed/setup-only skills, kept off the page
inputs:                       # optional - each becomes a pre-run picker
  - type: transcript|offer|avatar|video|client|project|idea|pov|text
    multiple: true            # optional
    optional: true            # optional
outputs:                      # optional - where the result goes
  - type: inbox|project|transcript|content|tasks
    description: what happens to this output
icon: youtube|instagram|image|web|copy|research|ideas|strategy|clients|meta
color: '#16C97E'              # the editor sets this from the icon
knowledge: vault files/paths the skill should read
notes: patterns/examples
---

# Skill Name

[the instructions body - what Claude actually follows]
```

### What each field does

- **name** - the invocation id. Kebab-case lowercase (`brand-voice-writing`, never `BrandVoiceWriting`). Do not rename it on edit; downstream skills reference it.
- **title / card** - the human-facing name and the one-line description on the Skills page.
- **description** - the trigger Claude reads when deciding whether to auto-apply the skill. Max 1024 chars, third person. First sentence: what it does. Second sentence: "Use when [specific triggers]." Good: "Extract text and tables from PDF files. Use when working with PDFs, forms, or document extraction."
- **category** - groups the skill on the page (Meta / Research / Ideas / Create / Strategy / Clients).
- **hidden** - keep composed-only or setup-only skills off the visible page; they still run and still compose.
- **inputs / outputs** - inputs become pre-run pickers (`multiple`/`optional` tune each); outputs declare where the result is saved so the run wires it up.
- **icon / color / knowledge / notes** - the page tile (editor sets color from the icon), plus the vault files the skill reads and any reference patterns.

## Body conventions

Keep the body to the instructions Claude follows. Useful sections:

- **Required vault data** - list the files the skill reads, with paths relative to the vault root. Error out clearly and name the missing file; never silently substitute generic content.
- **Skills used (in order)** - when the skill composes others (e.g. `youtube-script` runs outline, intro, value, cta, outro), list them with what each contributes. Don't duplicate methodology that lives in a composed skill - reference it.
- **Workflow / steps** - the process, with any STOP-and-confirm checkpoints called out.
- Any skill that produces a deliverable should save it AND show the full result in the chat - never just point the user at a file.

## Naming and location

Skills live at `.claude/skills/[skill-name]/SKILL.md` in the relevant vault root - this vault, the Solopreneur OS pack, or a channel vault. Pack skills ship to members via the sync.

## When to add scripts

Add scripts when the operation is deterministic, the same code would be generated repeatedly, or errors need explicit handling. Saves tokens, improves reliability.

## When to split files

Split into REFERENCE.md / EXAMPLES.md when SKILL.md exceeds 100 lines, content has distinct domains, or advanced features are rarely needed.

## Review checklist

- [ ] name, title, card, description, category all set
- [ ] description includes triggers ("Use when...")
- [ ] icon chosen; inputs/outputs declared if the skill takes input or saves a result
- [ ] hidden set correctly (composed/setup-only skills hidden)
- [ ] SKILL.md under 100 lines
- [ ] required vault data listed (or "None"); composed skills listed in order
- [ ] no em dashes anywhere - hyphens only
- [ ] no time-sensitive info; concrete examples included; references one level deep
