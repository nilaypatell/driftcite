#!/bin/zsh
# Run the clock by hand, against this working copy.
#
# This is NOT what the scheduled clock runs. The LaunchAgent
# (com.driftcite.refresh) executes ~/.driftcite/clock-run.sh against a separate
# checkout at ~/.driftcite/clock, because launchd cannot read ~/Desktop without
# a GUI Full Disk Access grant and this script failed with exit 127 every
# morning for a year's worth of mornings while the log said only "can't open
# input file".
#
# Keep this for running the sweep on demand and seeing its output. If you edit
# the steps here, edit ~/.driftcite/clock-run.sh too — they are deliberately
# separate files, and nothing keeps them in step but you.
#
# Same steps as .github/workflows/refresh.yml, which does not run: the account
# is locked over a billing dispute.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd /Users/nilaypatel/Desktop/driftcite || exit 1
export GITHUB_TOKEN=$(gh auth token)
PY=/Users/nilaypatel/.pyenv/versions/3.11.7/bin/python3

echo "=== $(date -u '+%Y-%m-%d %H:%M') UTC ==="
$PY scanner/refresh.py || exit 1
$PY scanner/watch_pages.py || exit 1
$PY scanner/probe_models.py || exit 1
$PY scanner/probe_sunset.py || exit 1
$PY scanner/build_feed.py || exit 1

git add manifests/ feed/
if git diff --staged --quiet; then
  echo "nothing to commit"
else
  git -c user.name="driftcite clock" -c user.email="77018379+nilaypatell@users.noreply.github.com" \
    commit -m "chore(feed): $(date -u +%Y-%m-%d) provider sweep (local clock)"

  # Never push a commit whose identity would credit the wrong account.
  if ! ./scripts/check_identity.sh HEAD~1..HEAD; then
    echo "refusing to push: unexpected commit identity"
    exit 1
  fi
  git push origin main
fi
