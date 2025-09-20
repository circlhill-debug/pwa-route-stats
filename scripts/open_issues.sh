#!/usr/bin/env bash
set -euo pipefail

# Requires GitHub CLI (gh) authenticated to repo.
# Usage: ./scripts/open_issues.sh

repo_url=$(git config --get remote.origin.url)
echo "Creating Phase 3 issues in $repo_url"

gh issue create --title "[Phase 3] Standardize W1 vs W2 labeling + math" \
  --label phase-3,enhancement \
  --body $'- Ensure Mon..today (W1) vs last same range (W2) everywhere.\n- Verify percentages for Hours/Parcels/Letters.\n- No mixing of baseline vs raw in same line.'

gh issue create --title "[Phase 3] Baseline compare: weekday alignment + days-used" \
  --label phase-3,enhancement \
  --body $'- Keep min guard (≥5 units).\n- Show days used in details.\n- Ensure baseline toggle never breaks UI.'

gh issue create --title "[Phase 3] Quick Filter polish: Normalized badge and All metrics toggle" \
  --label phase-3,enhancement \
  --body $'- Add small Normalized badge near legend when 2+ series.\n- Add All metrics on/off.\n- Optional: faint 0/50/100 ruler when normalized.'

echo "Done."

