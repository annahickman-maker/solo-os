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

**The easy way (one command does everything):** open Terminal, paste this, press Enter.

```bash
curl -fsSL https://raw.githubusercontent.com/annahickman-maker/solo-os/main/install.sh | bash
```

This installs Node and the Claude CLI if you don't have them, downloads the dashboard, installs the code **inside `/Applications/Solo OS.app`**, seeds your vault at **`~/Desktop/Solo OS`**, and opens it.

**Two folders, two jobs:**

- **Code** lives inside `/Applications/Solo OS.app` - self-contained and off iCloud, which keeps it fast and stable. The app's update button refreshes it.
- **Your vault** lives at `~/Desktop/Solo OS` - your data, in plain markdown + JSON. Point Claude Code at this folder to work in it.

The installer is also the **reinstall** command - run it again anytime to get a clean, up-to-date copy of the code. A reinstall **never touches your `~/Desktop/Solo OS` vault**; only the app's code is refreshed. (Already a member from the old layout at `~/Desktop/solo-os`? The installer migrates you automatically: it preserves your vault to `~/Desktop/Solo OS` and moves the old folder to the Trash.)

**The manual way**, if you'd rather do each step yourself:

```bash
git clone https://github.com/annahickman-maker/solo-os.git ~/solo-os-src
cd ~/solo-os-src
./setup.sh
```

`setup.sh` seeds your vault at `~/Desktop/Solo OS` (first run only), then installs the code into **Solo OS.app** in `/Applications/` with a custom icon. The folder you cloned into is just a staging copy - you can delete it afterwards. Launch the app by double-clicking it (or hit ⌘-space and type "Solo OS").

The first launch takes ~10 seconds to spin up the three services. Then Chrome opens to http://localhost:5174. Password is `dev`.

**Windows users:** see [WINDOWS.md](WINDOWS.md) for the manual install steps (no `.exe` installer yet).

## Daily flow

Double-click Solo OS in your Dock or Applications folder. Browser opens. Use the dashboard. Close the tab when you're done; the services keep running until you restart your Mac.

The dashboard opens fast because it serves a pre-built version. If you use Claude Code to change the dashboard's own code, your change is picked up automatically the next time you launch (a quick rebuild, only when something changed). If you want to actively iterate on the code with live reload, launch in dev mode (the code lives inside the app):

```bash
DEV_MODE=1 "/Applications/Solo OS.app/Contents/Resources/app/start-local.sh"
```

## Your vault

By default the dashboard reads and writes your vault at **`~/Desktop/Solo OS`** (created for you on first install, seeded with the starter files). Everything in it is plain markdown + JSON - point Claude Code at that folder to work in it.

The 6 `01_Core/core_*.md` files are the most important - drop yours in and the dashboard auto-extracts your brand slots, avatars, POVs, journey timeline, offer rungs, and wins the first time you open it. This takes ~90 seconds. Reputation and Offer pages populate immediately after.

To point at a different vault instead:

```bash
VAULT_ROOT="/path/to/your/vault" open "/Applications/Solo OS.app"
```

The vault lives on your Desktop (not inside the app) on purpose: it's plain text with no git and low churn, so iCloud syncing it is fine - and keeping it out of the app means a reinstall can never lose your data.

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

When I ship improvements, open **Settings** in the dashboard and click **"update + restart"**. It pulls the latest code (inside the app) and restarts the services for you. You need a current Solopreneur Systems membership key for updates to run.

If you'd rather update from the terminal:

```bash
cd "/Applications/Solo OS.app/Contents/Resources/app"
git pull
```

Your vault at `~/Desktop/Solo OS` is never touched by an update or a reinstall.

## Troubleshooting

**Dashboard opens but AI features do not work.** You haven't run `claude auth login` yet. Open a terminal: `claude auth login`. Browser flow. Done.

**Solo OS will not launch.** First launch takes ~10 seconds to boot three services. If it still won't open, the reliable fix is a clean reinstall - open Terminal, paste this, press Enter:

```bash
curl -fsSL https://raw.githubusercontent.com/annahickman-maker/solo-os/main/install.sh | bash
```

It refreshes the app's code and rebuilds the launcher, and leaves your `~/Desktop/Solo OS` vault untouched. To see the raw logs instead, check `/tmp/solo-os-*.log`.

**Extraction never finishes.** Check `/tmp/solo-os-server.log` and `/tmp/solo-os-claude-bridge.log` for errors. Almost always: `claude auth login` hasn't been run.

**Something else.** Drop a comment in the [SS community](https://www.skool.com/mastermind-5724/about) - if you're a member, that's where the help lives. Non-members can open a GitHub issue.

## What's in here

```
server/                Hono backend that reads + writes the vault
frontend/              Vite + React dashboard UI
claude-bridge/         Tiny HTTP service that spawns `claude -p`
sample-vault/          Starter vault - seeds ~/Desktop/Solo OS on first install
install.sh             One-line installer / reinstaller (curl | bash)
setup.sh               Manual setup from a clone
build-dashboard-app.sh Installs the code into /Applications/Solo OS.app
start-local.sh         Supervised launcher for all three services
restart.sh             Stops + relaunches this install (the in-app update button)
AppIcon.icns           Branded macOS app icon
CLAUDE.md              Architecture guide for anyone modifying the dashboard
DEPLOY.md              Detailed setup guide
WINDOWS.md             Manual install steps for Windows
```

After install, the code lives inside the app at
`/Applications/Solo OS.app/Contents/Resources/app/`, and your data lives in
`~/Desktop/Solo OS/`.

## License + maintenance

I maintain this repo because I run my business off of it. Forks and PRs are welcome but I don't promise to merge them. If you want material changes to land, the [SS community](https://www.skool.com/mastermind-5724/about) is the place - your ideas inform what I build next.

This is meant as a tool you make your own. Use it, modify it, change the things that don't work for your brain.
