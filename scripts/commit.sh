#!/bin/bash

# Script to automatically add and commit changes
# Usage: ./scripts/commit.sh "commit message"

if [ $# -eq 0 ]; then
  echo "Error: Commit message required"
  echo "Usage: ./scripts/commit.sh \"your commit message\""
  exit 1
fi

COMMIT_MESSAGE="$1"

# Add all changes
git add -A

# Check if there are any staged changes
if git diff --cached --quiet; then
  echo "No changes to commit"
  exit 0
fi

# Commit with the provided message
git commit -m "$COMMIT_MESSAGE"

# Show commit result
if [ $? -eq 0 ]; then
  echo "✓ Changes committed successfully"
else
  echo "✗ Failed to commit changes"
  exit 1
fi
