# Solo OS tracking worker

A small Cloudflare Worker that powers the conversion tracking system on your dashboard's offer pages. Serves `/go/<slug>` short links from a JSON manifest in your vault and counts clicks in Cloudflare KV.

## Set this up

Don't follow these steps by hand - run the setup skill from Claude in your Solo OS folder:

```
set up conversion tracking
```

Claude walks you through the whole thing in about 15 minutes.

## What's in this folder

- `src/index.ts` - the worker code (handles `/go/<slug>` redirects + `/link-stats` queries)
- `src/link-manifest.ts` - **auto-generated**, don't edit. Built from `scripts/link_manifest.json` at deploy time.
- `wrangler.toml` - Cloudflare worker config (you edit this once during setup)
- `package.json` - npm scripts. The important one is `npm run deploy`.

## What lives outside this folder

- `scripts/link_manifest.json` (in your vault root) - the source of truth for every tracking link. Each offer's "Generate tracking link" button on the dashboard writes here. `npm run deploy` syncs this into the worker and ships.

## Day-to-day

You don't run any commands here yourself. The dashboard does it for you. Every time you click "Generate tracking link" on an offer, the dashboard:

1. Updates `scripts/link_manifest.json` with the new slug
2. Runs `npm run deploy` in this folder to publish the new manifest

The only time you come back here is if you want to change the worker's domain or rotate the KV namespace. For both, rerun the setup skill.
