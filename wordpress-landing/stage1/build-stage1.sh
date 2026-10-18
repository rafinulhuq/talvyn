#!/bin/sh
# Build the Stage 1 WordPress paste files from ../sections/*.html.
# Touches nothing in frontend/ — output lands in this folder only.
#
#   sh build-stage1.sh
#   APP_ORIGIN=https://app.example.org VIDEO_URL=https://www.example.org/wp-content/uploads/2026/09/talvyn.mp4 sh build-stage1.sh
set -eu
cd "$(dirname "$0")"

APP_ORIGIN="${APP_ORIGIN:-https://app.talvyn.com}"
VIDEO_URL="${VIDEO_URL:-assets/talvyn.mp4}"

rm -f blocks/*.html page-blocks.html
: > page-blocks.html

for src in ../sections/*.html; do
  name=$(basename "$src")
  # /login and /dashboard/* live on the app host, not on WordPress.
  # In-page anchors, /blog and / are served by WordPress and stay relative.
  sed -e "s|href=\"/login\"|href=\"${APP_ORIGIN}/login\"|g" \
      -e "s|href=\"/dashboard/|href=\"${APP_ORIGIN}/dashboard/|g" \
      -e "s|assets/talvyn\.mp4|${VIDEO_URL}|g" \
      "$src" > "blocks/$name"

  # Block locking keeps the operator from deleting or reordering a section by
  # accident. An administrator can lift it per block: toolbar ⋮ → Lock.
  {
    printf '<!-- wp:html {"lock":{"move":true,"remove":true}} -->\n'
    cat "blocks/$name"
    printf '<!-- /wp:html -->\n\n'
  } >> page-blocks.html
done

# Local preview, so the page can be checked in a browser before it reaches
# WordPress. The wp:html comments are inert HTML comments, so page-blocks.html
# can be embedded as-is.
{
  printf '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
  printf '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
  printf '<title>Talvyn landing — Stage 1 preview</title>\n'
  printf '<link rel="stylesheet" href="child-theme/landing.min.css">\n'
  printf '<style>body{margin:0}</style>\n</head>\n<body>\n'
  sed 's|"assets/talvyn\.mp4"|"../assets/talvyn.mp4"|g' page-blocks.html
  printf '<script src="child-theme/landing.js"></script>\n</body>\n</html>\n'
} > preview.html

printf 'Built %s block files.\n' "$(ls blocks/*.html | wc -l)"
printf 'App origin: %s\n' "$APP_ORIGIN"
printf 'Video URL:  %s\n' "$VIDEO_URL"
