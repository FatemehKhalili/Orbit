#!/usr/bin/env sh
# Create .env from .env.example with a freshly generated POSTGRES_PASSWORD.
# Refuses to overwrite an existing .env.
set -eu

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  echo ".env already exists; leaving it unchanged." >&2
  exit 0
fi

password=$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')
sed "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=${password}/" .env.example > .env
chmod 600 .env
echo "Created .env with a random POSTGRES_PASSWORD."
