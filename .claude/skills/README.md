# Skills

All skills live flat in this directory. Naming convention groups them visually:

- `solopreneur-*` — Solopreneur OS foundation pack
- `youtube-*` — YouTube skill pack
- (future packs follow the same prefix pattern: `web-design-*`, `client-os-*`, etc.)

---

## Solopreneur OS pack (1 skill)

The foundation everything else reads from. Run this first.

| Skill | What it does |
|---|---|
| `solopreneur-onboarding` | 6-phase coaching conversation that produces the foundational core files: positioning, audience, story, IP, offer suite, voice |

---

## YouTube skill pack (18 skills)

Channel-specific skills. Requires Solopreneur OS onboarding to be complete first.

### Setup (run once)

| Skill | What it does |
|---|---|
| `youtube-onboarding` | One-time channel positioning setup. Required before any other YouTube skill works |
| `youtube-setup-api` | One-time YouTube API connection (API key + channels + keywords). Powers Title Radar, title generator, channel stats, and analytics review |
| `setup-conversion-tracking` | One-time deploy of the Cloudflare tracking worker that powers the dashboard's `/go/<slug>` short links and conversion data |

### Ideation + planning

| Skill | What it does |
|---|---|
| `youtube-ideas` | Develop a raw video idea into a packaged concept |
| `youtube-transformation-series` | Plan a 5-video launch series mapped to the user's core IP |

### Titles + thumbnails

| Skill | What it does |
|---|---|
| `youtube-title` | Generate 10 title options + 5 thumbnail phrases (uses title radar if configured) |
| `youtube-thumbnail` | Design a thumbnail (background generation + composite + headline overlay) |

### Scripting

| Skill | What it does |
|---|---|
| `youtube-script` | Orchestrator that takes a video from idea to finished script |
| `youtube-script-outline` | Build the structural skeleton of a script |
| `youtube-script-intro` | Write the spoken intro using the 5-beat framework |
| `youtube-script-context` | Write the section between intro and value |
| `youtube-script-value` | Write one value section (called once per teaching point) |
| `youtube-script-cta` | Write the mid-video implementation-helper CTA |
| `youtube-script-outro` | Write the closing outro |

### Post-film

| Skill | What it does |
|---|---|
| `youtube-post-film` | Auto-runs when a transcript is dropped: archives the script, updates voice, generates description |
| `youtube-description` | Generate a complete YouTube description from a transcript |

### Ongoing

| Skill | What it does |
|---|---|
| `youtube-analytics` | Channel-wide analytics that updates learnings over time |
| `youtube-update` | Check for and install updates to YouTube skill files |

---

## Adding a new skill

1. Create `.claude/skills/<your-skill-name>/SKILL.md` (flat, one level deep — Claude Code's skill discovery is one level)
2. Use the prefix convention to group with the right pack (e.g., `youtube-*` for YouTube pack)
3. Add an entry to the table above
4. The skill is immediately invokable as `/<your-skill-name>`

See the [Anthropic skills docs](https://code.claude.com/docs/en/skills) for SKILL.md format.
