# Solo OS

A local-only operating dashboard for solopreneurs. The same tool I use every day to run my one-person business.

> **This is one part of a bigger system.** The dashboard is a tool. The methodology that makes it work - the positioning, the offer ladder, the content engine, the way the foundation files feed every downstream surface - lives inside [**Solopreneur Systems**](https://www.skool.com/mastermind-5724/about), my paid community.
>
> If you just want the code, clone it. It runs. But the dashboard is built around a specific way of thinking about a one-person business: define your foundation once, let it drive everything downstream. Without the methodology, you have a clean UI over your own markdown files. With the methodology, you have an operating system.
>
> If you're an SS member, the dashboard came to you through the community and you already know what it's for. If you found this repo on its own, welcome - [come check out SS](https://www.skool.com/mastermind-5724/about) to see how the pieces fit together.

---

## What it does

A vault folder of markdown + JSON files is the database. Three local services on your machine read and write that vault. No cloud, no signup, no data leaves your laptop.

The dashboard has 13 pages. The important ones:

- **Today** - your greeting, focus rings (strain / deep work / focus), the tasks you committed to this week
- **Focus** - your 90-day goal, sub-goals, the rolling sprint
- **Projects** - one-person businesses are a project portfolio; this tracks both your own projects and client engagements
- **Content** - YouTube pipeline + Instagram queue, AI title gen, transcript drop, video script builder
- **Profile** - the 6 foundational files (positioning, audience, story, IP, offer suite, voice) + Foundation map of every Layer 2 store + Reputation + Offer
- **Voice** - 200+ brainstorm questions to mine your voice for content
- **Inbox** - Skool replies, Zoom transcripts, generic inbox
- **Skills, Vault, Settings** - the rest

The foundation is the part to understand: 6 prose files in `01_Core/` describe who you are, who you help, your story, your IP, your offers, your voice. The dashboard parses those into 18+ structured slots, then every other page reads from those slots. Define your foundation once. Every video title, every offer page, every script knows who you are.

## Install (Mac, ~10 minutes)

You need four things first:
1. **Node 20+** (download from https://nodejs.org)
2. **A Claude subscription** - Pro ($20/mo) or Max ($100/mo). The dashboard uses YOUR subscription for all AI features. No API key, no metered billing.
3. **The Claude Code CLI** from https://claude.com/code. After installing, run `claude auth login` once - browser opens, sign in to your Claude account.
4. **An active [Solopreneur Systems](https://www.skool.com/mastermind-5724/about) membership.** Solo OS is built for SS members - the current access key is pinned at the top of the community. You paste it once on first launch; the dashboard re-checks it when you click "update" inside Settings. If your SS membership lapses the dashboard keeps running with whatever version you have, but updates stop until you rejoin and paste the current key.

Then:

```bash
git clone https://github.com/annahickman-maker/solo-os.git ~/Desktop/solo-os
cd ~/Desktop/solo-os
./setup.sh
```

The setup script runs `npm install` in three sub-folders, verifies your Claude CLI is set up, and builds **Solo OS.app** into your `/Applications/` folder with a custom icon. Double-click it (or hit ⌘-space and type "Solo OS") to launch.

The first launch takes ~10 seconds to spin up the three services. Then Chrome opens to http://localhost:5174. Password is `dev`.

**Windows users:** see [WINDOWS.md](WINDOWS.md) for the manual install steps (no `.exe` installer yet).

## Daily flow

Double-click Solo OS in your Dock or Applications folder. Browser opens. Use the dashboard. Close the tab when you're done; the services keep running until you restart your Mac.

## Point at your own vault

By default the dashboard uses the bundled `sample-vault/`. To use your own:

```bash
VAULT_ROOT="/path/to/your/vault" open "/Applications/Solo OS.app"
```

Or edit the default in `start-local.sh`.

Your vault should follow the structure under `sample-vault/`. The 6 `01_Core/core_*.md` files are the most important - drop yours in and the dashboard auto-extracts your brand slots, avatars, POVs, journey timeline, offer rungs, and wins the first time you open it. This takes ~90 seconds. Reputation and Offer pages populate immediately after.

## What you get from this repo vs. what you get from SS

**This repo (free):**
- The dashboard code, runs on your machine
- A sample vault you can poke at to see what the structure looks like
- The auto-extraction that turns your 6 core files into structured data the rest of the dashboard reads

**Solopreneur Systems ($47/mo at [skool.com/mastermind-5724](https://www.skool.com/mastermind-5724/about)):**
- The methodology the dashboard is built around (positioning, offer ladder, content engine, launch sprint, scaling)
- The Foundation workshop that teaches you what to put in the 6 core files - your positioning, who you help, your transformation, your IP, your offers, your voice. The dashboard will run without these. It won't run *for* you.
- Weekly Q&A calls where I answer your specific questions on your specific business
- The community of other solopreneurs running the same system
- Every future update to the dashboard, automatically (`git pull`)

The dashboard is a smart workspace. SS is what makes it work for your specific business. Clone the repo and you have a clean UI over a folder of files. Pair it with the methodology and you have an operating system.

## Updates

When I ship improvements:

```bash
cd ~/Desktop/solo-os
git pull
```

Your vault (outside this repo) is never touched.

## Troubleshooting

**Dashboard opens but AI features do not work.** You haven't run `claude auth login` yet. Open a terminal: `claude auth login`. Browser flow. Done.

**Solo OS will not launch.** First launch takes ~10 seconds to boot three services. If it still won't open, double-click `start-local.sh` directly from the cloned repo to see the logs in Terminal.

**Extraction never finishes.** Check `/tmp/solo-os-server.log` and `/tmp/solo-os-claude-bridge.log` for errors. Almost always: `claude auth login` hasn't been run.

**Something else.** Drop a comment in the [SS community](https://www.skool.com/mastermind-5724/about) - if you're a member, that's where the help lives. Non-members can open a GitHub issue.

## What's in here

```
server/         Hono backend that reads + writes the vault
frontend/       Vite + React dashboard UI
claude-bridge/  Tiny HTTP service that spawns `claude -p`
sample-vault/   Example vault - default VAULT_ROOT
setup.sh        One-time installer (npm install + build the .app)
start-local.sh  Supervised launcher for all three services
AppIcon.icns    Branded macOS app icon
CLAUDE.md       Architecture guide for anyone modifying the dashboard
DEPLOY.md       Detailed setup guide
WINDOWS.md      Manual install steps for Windows
```

## License + maintenance

I maintain this repo because I run my business off of it. Forks and PRs are welcome but I don't promise to merge them. If you want material changes to land, the [SS community](https://www.skool.com/mastermind-5724/about) is the place - your ideas inform what I build next.

This is meant as a tool you make your own. Use it, modify it, change the things that don't work for your brain.
