#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ] || [ "$#" -ne 1 ]; then
  echo 'Usage: sudo sh deploy/install-ci.sh /path/to/deploy-key.pub' >&2
  exit 1
fi
public_key_file=$1
if [ ! -f "$public_key_file" ]; then
  echo 'Public SSH key file not found.' >&2
  exit 1
fi
if [ "$(awk 'NF { count++ } END { print count+0 }' "$public_key_file")" -ne 1 ]; then
  echo 'Expected exactly one public SSH key.' >&2
  exit 1
fi
key_type=$(awk 'NF { print $1 }' "$public_key_file")
key_data=$(awk 'NF { print $2 }' "$public_key_file")
if [ "$key_type" != ssh-ed25519 ]; then
  echo 'An ed25519 public key is required.' >&2
  exit 1
fi
case "$key_data" in
  ''|*[!A-Za-z0-9+/=]*) echo 'Invalid public SSH key.' >&2; exit 1 ;;
esac
ssh-keygen -l -f "$public_key_file" >/dev/null
deploy_home=$(getent passwd marik | cut -d: -f6)
if [ "$deploy_home" != /home/marik ]; then
  echo 'Expected the existing marik account with home /home/marik.' >&2
  exit 1
fi
group=$(id -gn marik)
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
install -o root -g root -m 0755 "$script_dir/ci-remote.sh" /usr/local/bin/minechat-deploy
if [ -L "$deploy_home/.ssh" ] || [ -L "$deploy_home/.ssh/authorized_keys" ]; then
  echo 'Refusing a symlinked SSH directory or authorized_keys file.' >&2
  exit 1
fi
install -d -o marik -g "$group" -m 0700 "$deploy_home/.ssh"
authorized_keys="$deploy_home/.ssh/authorized_keys"
touch "$authorized_keys"
entry="command=\"/usr/local/bin/minechat-deploy\",restrict $key_type $key_data minechat-actions"
if ! grep -qxF "$entry" "$authorized_keys"; then
  # Leading newline keeps an existing final key intact even without a trailing newline.
  printf '\n%s\n' "$entry" >> "$authorized_keys"
fi
chown marik:"$group" "$authorized_keys"
chmod 0600 "$authorized_keys"
echo 'Restricted GitHub Actions deployment key installed; existing SSH keys preserved.'
