#!/bin/zsh
# The daily driftcite clock, run locally while GitHub Actions is unavailable.
# Same steps as .github/workflows/refresh.yml: poll, diff, rebuild, commit.
# Unload the LaunchAgent once CI takes over, or two clocks will race.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd /Users/nilaypatel/Desktop/driftcite || exit 1
export GITHUB_TOKEN=$(gh auth token)
PY=/Users/nilaypatel/.pyenv/versions/3.11.7/bin/python3

echo "=== $(date -u '+%Y-%m-%d %H:%M') UTC ==="
$PY scanner/refresh.py || exit 1
$PY scanner/build_feed.py || exit 1

git add manifests/ feed/
if git diff --staged --quiet; then
  echo "nothing to commit"
else
  git -c user.name="driftcite clock" -c user.email="77018379+nilaypatell@users.noreply.github.com" \
    commit -m "chore(feed): $(date -u +%Y-%m-%d) provider sweep (local clock)"
  git push origin main
fi
