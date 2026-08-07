#!/bin/zsh
# The driftcite clock — the copy of record.
#
# The LaunchAgent runs ~/.driftcite/clock-run.sh, not this file. This is the
# version-controlled original: copy it over after editing, or the machine and
# the repository quietly disagree about what the clock does.
#
#     cp scripts/clock-run.sh ~/.driftcite/clock-run.sh
#
#
# It runs from ~/.driftcite/clock rather than the working copy on the Desktop
# because a LaunchAgent cannot read ~/Desktop without Full Disk Access, which
# is a GUI grant. The agent failed with exit 127 every morning for that reason
# and the failure looked like a missing file. $HOME outside Desktop, Documents
# and Downloads is not TCC-protected, so a second checkout here is the whole
# fix. It is a plain clone with its own remote; nothing here touches the
# Desktop copy, so the two cannot fight over a dirty tree.
#
# GitHub Actions would be the better home for this and is not available: the
# account is locked over a billing dispute, so scheduled runs never start.

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
REPO="$HOME/.driftcite/clock"
# A specific interpreter, not whatever PATH resolves to. launchd does not
# inherit the interactive shell's pyenv shims, so `command -v python3` found a
# system Python with no pyyaml and every scanner died on the import. Pinning
# the one that has it is the difference between a clock that runs and a clock
# that logs five tracebacks.
for candidate in \
  "$HOME/.pyenv/versions/3.11.7/bin/python3" \
  "/opt/homebrew/bin/python3" \
  "$(command -v python3)"; do
  if [ -x "$candidate" ] && "$candidate" -c 'import yaml' 2>/dev/null; then
    PY="$candidate"; break
  fi
done
if [ -z "$PY" ]; then
  echo "no python3 with pyyaml found; install it and rerun"
  exit 1
fi
echo "python: $PY"

cd "$REPO" || { echo "no clock checkout at $REPO"; exit 1; }
echo "=== $(date -u '+%Y-%m-%d %H:%M') UTC  driftcite clock"

# A token is needed for the provider polling and for the push. gh keeps it in
# the keychain, which a user agent can reach while the user is logged in.
if command -v gh >/dev/null 2>&1; then
  GITHUB_TOKEN="$(gh auth token 2>/dev/null)"
  export GITHUB_TOKEN
fi
[ -z "$GITHUB_TOKEN" ] && echo "warning: no GITHUB_TOKEN; provider polling will be rate-limited"

git fetch -q origin && git reset -q --hard origin/main

"$PY" scanner/refresh.py     || echo "! refresh failed"
"$PY" scanner/watch_pages.py || echo "! page watch failed"
"$PY" scanner/probe_models.py || echo "! model probe failed"
"$PY" scanner/probe_sunset.py || echo "! sunset probe failed"
"$PY" scanner/build_feed.py  || { echo "! feed build refused; nothing committed"; exit 1; }

# Sign what was just built, against the key at ~/.driftcite/feed-key.pem.
# An unsigned feed is one every up-to-date client will refuse and fall back
# from, so failing to sign fails the run — visibly, with nothing committed —
# rather than publishing an update nobody will use.
node scripts/sign_feed.mjs   || { echo "! feed signing failed; nothing committed"; exit 1; }

git add manifests/ feed/
if git diff --staged --quiet; then
  echo "nothing moved today"
  exit 0
fi

git -c user.name="driftcite clock" \
    -c user.email="77018379+nilaypatell@users.noreply.github.com" \
    commit -q -m "chore(feed): $(date -u +%Y-%m-%d) provider sweep"

# Never push a commit whose identity would credit the wrong account.
if ! ./scripts/check_identity.sh HEAD~1..HEAD; then
  echo "refusing to push: unexpected commit identity"
  exit 1
fi
git push -q origin main && echo "pushed $(git rev-parse --short HEAD)"
