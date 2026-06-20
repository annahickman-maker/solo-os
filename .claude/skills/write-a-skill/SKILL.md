---
name: write-a-skill
description: Create new agent skills with proper structure, progressive disclosure, and bundled resources. Use when the user wants to create, write, or build a new skill, when adding a skill to Solopreneur OS or any client vault, or when documenting a methodology so Claude can apply it consistently.
---

# Writing Skills

Canonical standard for every skill written for the master vault, Solopreneur OS, OS Builds clients, and Channel vaults. Read this before writing any new skill.

## Process

1. **Gather requirements** — task, use cases, scripts needed, vault data dependencies, composed skills.
2. **Draft the skill** — `SKILL.md` (under 100 lines), plus `REFERENCE.md` / `EXAMPLES.md` / `scripts/` only if needed.
3. **Review with the user** — confirm coverage before finalising.

## Skill structure

```
skill-name/
├── SKILL.md           # Required, under 100 lines
├── REFERENCE.md       # Optional - detailed docs
├── EXAMPLES.md        # Optional - usage examples
└── scripts/           # Optional - utility scripts
```

## SKILL.md template

```md
---
name: skill-name
description: Brief description. Use when [specific triggers].
---

# Skill Name

## Required vault data
[Files this skill reads, or "None"]

## Skills used (in order)
[Composed skills, or omit if standalone]

## Quick start
[Minimal working example]

## Workflows
[Step-by-step process with checklists]

## Advanced features
[Link to REFERENCE.md or EXAMPLES.md]
```

## Description requirements

The description is the only thing the agent sees when picking which skill to load.

- Max 1024 chars, third person
- First sentence: what it does
- Second sentence: "Use when [specific triggers]"
- Good: "Extract text and tables from PDF files. Use when working with PDFs, forms, or document extraction."

## Naming and location

- Kebab-case lowercase: `brand-voice-writing`, never `BrandVoiceWriting`
- Path: `.claude/skills/[skill-name]/SKILL.md` at the root of the vault
- Master vault: `<vault>/.claude/skills/`
- Client vault: `[client-vault]/.claude/skills/`
- Solopreneur OS template skills: ship inside the SS module template

## Skills that read vault data

When a skill depends on captured data (e.g. `voice-writing` reads `core_voice-style.md`):

- List required files at the top under `## Required vault data` with paths relative to vault root
- Error out clearly if a required file is missing — name the missing file
- Don't silently substitute generic content when data is missing

## Skills that compose other skills

When a workflow invokes multiple skills in sequence (e.g. `script-builder` → outline → intro → body → CTA → outro):

- List dependent skills under `## Skills used (in order)` with what each contributes
- Don't duplicate methodology that lives in a composed skill — reference it

## When to add scripts

Add scripts when the operation is deterministic, the same code would be generated repeatedly, or errors need explicit handling. Saves tokens, improves reliability.

## When to split files

Split into REFERENCE.md / EXAMPLES.md when SKILL.md exceeds 100 lines, content has distinct domains, or advanced features are rarely needed.

## Review checklist

- [ ] Description includes triggers ("Use when...")
- [ ] SKILL.md under 100 lines
- [ ] Required vault data listed (or "None")
- [ ] Composed skills listed in order (if applicable)
- [ ] No time-sensitive info
- [ ] Concrete examples included
- [ ] References one level deep
