#!/bin/sh
set -eu

# This is the only command allowed for the GitHub Actions SSH key.
command=${SSH_ORIGINAL_COMMAND:-}
case "$command" in
  'deploy '*) revision=${command#deploy } ;;
  *) echo 'Only deploy <commit-sha> is allowed.' >&2; exit 1 ;;
esac
case "$revision" in
  ''|*[!0-9a-f]*) echo 'Invalid commit SHA.' >&2; exit 1 ;;
esac
if [ "${#revision}" -ne 40 ]; then
  echo 'Expected a 40-character commit SHA.' >&2
  exit 1
fi
if [ "$(id -un)" != marik ]; then
  echo 'Run this command as marik.' >&2
  exit 1
fi

mkdir -p /home/marik/.cache
exec 9>/home/marik/.cache/minechat-deploy.lock
flock -w 1200 9
cd /home/marik/minechat
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo 'Deployment stopped: the server has tracked local changes.' >&2
  exit 1
fi
git fetch --no-tags origin master
if ! git merge-base --is-ancestor "$revision" FETCH_HEAD; then
  echo 'Commit is not part of the remote master branch.' >&2
  exit 1
fi
git checkout master
if git merge-base --is-ancestor "$revision" HEAD && [ "$(git rev-parse HEAD)" != "$revision" ]; then
  echo 'A newer commit is already deployed; skipping stale request.'
  exit 0
fi
git merge --ff-only "$revision"
printf 'Deploying commit %s\n' "$(git rev-parse HEAD)"
sudo -n sh deploy/deploy.sh
