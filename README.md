# Manika Goel — Tools

Static HTML tools deployed to Manika's own domain via Cloudflare Pages.
No build step — every folder is a plain, self-contained `index.html`.

## Adding a new tool

1. Create a new folder here, e.g. `new-tool-name/index.html`.
2. Add a link to it in the root `index.html`.
3. Commit and push. Cloudflare Pages auto-deploys on every push to `main`.

## Source of truth for editing

These files are also kept (and actively edited) inside Manika's AI
assistant project at `content/apps/<tool-name>/index.html`. When a tool
changes there, copy the updated `index.html` into the matching folder
here before pushing, so the deployed site and the working copy don't
drift apart.
