#!/bin/bash
# Download local
 copies of required libraries for offline/blocked-CDN use
set -e
cd "$(dirname "$0")"
mkdir -p vendor

echo "Fetching Luxon…"
curl -fsSL "https://unpkg.com/luxon@3/build/global/luxon.min.js" -o vendor/luxon.min.js

echo "Fetching Chart.js…"
curl -fsSL "https://unpkg.com/chart.js@4.4.1/dist/chart.umd.js" -o vendor/chart.umd.js

echo "Fetching Supabase JS…"
curl -fsSL "https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.js" -o vendor/supabase.js

echo "Done. Reload the app — it will use local libraries from ./vendor/."

