# linkdin-extraction · Post Studio

AI-drafted LinkedIn posts with a human approval gate.

**Idea → Claude draft → Humanizer → Score + compliance gate → Human approval → Queue → LinkedIn → Performance tracking**

📄 **Submission document:** [docs/Post-Studio-Submission.pdf](docs/Post-Studio-Submission.pdf) covers what it does, the architecture, how each part connects, and setup.

## What's in this repository

| Folder | What it is |
|---|---|
| [`post-studio/`](post-studio/) | **The main app** (Next.js 15, React 19, TypeScript). UI, API routes, core library and the queue worker. See [post-studio/README.md](post-studio/README.md) for full setup. |
| [`bin/li-publish`](bin/li-publish) | The first prototype: a terminal script that humanizes a draft, scores it, asks y/N and posts through LinkedIn's Posts API. |
| [`drafts/`](drafts/) | Early drafts and their humanized `.clean.txt` versions. |
| [`docs/`](docs/) | The submission PDF and its HTML source. |

Post Studio uses the open-source [LinkedIn agent skill pack](https://github.com/Jakeschincariol/linkedin-agent-skill) by Jake Schincariol (MIT), installed into `~/.claude/skills` (li-post, li-human, li-profile and others).

## How it connects

- **Claude:** all AI steps (draft, improve, punch lines, image layout, profile score and plan) go through `post-studio/lib/llm.ts`. It uses the Anthropic API when `ANTHROPIC_API_KEY` is set, and otherwise the local Claude Code CLI.
- **Claude skills:** li-post gives drafting rules and hook formulas, and li-human runs the Python humanizer and detector.
- **LinkedIn:** OAuth 2.0 / OpenID Connect sign-in (`openid profile w_member_social`), then the Posts API and Images API to publish.
- **Local storage:** posts, readings, screenshots, settings and the LinkedIn token live in `post-studio/data/`. Keys live in `post-studio/.env.local`. Both are gitignored and never committed.
- **Worker:** `npm run worker` publishes scheduled posts and re-checks the off-limits list right before posting.

## Quick start

```bash
cd post-studio
npm install
npm run dev            # http://localhost:3009
npm run worker         # second terminal, for scheduled posts
```

Create `post-studio/.env.local` with `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `ANTHROPIC_API_KEY` (optional), `LI_VERSION` and `POST_STUDIO_LIVE=0`. Then go to **Settings → Connect LinkedIn**. The step-by-step guide is in [post-studio/README.md](post-studio/README.md).

## Safety by design

- Nothing is posted without a named approver. Live posting is off unless `POST_STUDIO_LIVE=1`.
- An off-limits list blocks client names, internal metrics and NDA terms, both at approval and right before posting.
- Claude may only use facts you supply. Gaps become `{{placeholders}}` that block approval.
- It never comments, messages, follows or scrapes. Analytics are real numbers you enter.
