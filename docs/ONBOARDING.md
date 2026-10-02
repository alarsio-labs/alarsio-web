# Onboarding — get running in under an hour

Do these in order. Tick as you go.

## 1 · Accounts

- [ ] GitHub account with **2FA on** — required by the org
- [ ] Accept your invite to the `alarsio-labs` organisation
- [ ] Supabase account (free tier)
- [ ] Claude Code installed and signed in

## 2 · Tools

| Tool | Version | Check |
| :-- | :-- | :-- |
| Node | 20 or newer | `node -v` |
| pnpm | 9 or newer | `pnpm -v` |
| Git | any recent | `git --version` |
| Docker Desktop | any recent | `docker -v` |
| GitHub CLI | any recent | `gh --version` |

```bash
npm install -g pnpm@9
```

## 3 · Your git identity ⚠️

**Get this wrong and your commits do not appear on your GitHub profile or the
contribution graph.** The program is graded on that.

```bash
git config --global user.name "Your Full Name"
git config --global user.email "the-email-on-your-github-account"
```

Verify the email matches one listed at **github.com/settings/emails**:

```bash
git config --global user.email
```

## 4 · Clone and install

```bash
gh auth login
git clone https://github.com/alarsio-labs/alarsio-web.git
cd alarsio-web
pnpm install
```

## 5 · Environment

```bash
cp .env.example apps/web/.env.local
```

Fill in your Supabase URL and publishable key from the project dashboard
(**Settings → API**).

**Never** put the service-role key in any file in this repo. Not once, not
temporarily. CI fails the build if it finds the string.

## 6 · Check it runs

```bash
pnpm typecheck
pnpm dev --filter=web
```

## 7 · Read, in this order

1. `CLAUDE.md` — 5 minutes, and it is what Claude Code reads too
2. `docs/WORKFLOW.md` — how we work
3. `docs/ARCHITECTURE.md` — the module you own
4. `docs/FEATURES.md` — find your name, read your rows
5. `docs/IMPROVEMENTS.md` — the mistakes we are not repeating

## 8 · Your first contribution

Do a tiny one today, so the whole loop is familiar before it matters:

```bash
git checkout -b docs/add-<yourname>-to-readme
# add your name to the Team section of README.md
git add README.md
git commit -m "Add <Your Name> to the team list"
git push -u origin docs/add-<yourname>-to-readme
gh pr create --fill
```

Then ask someone else to review and merge it. That is the loop you will repeat
about forty times over the next eight weeks.

## Stuck?

Ask in the issue, in writing. A question answered in a thread helps the next
person; a question answered on a call helps one person once.
