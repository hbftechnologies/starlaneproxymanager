#!/command/with-contenv bash
# shellcheck shell=bash

set -e
set +x

echo "
-------------------------------------
 ____  ____  __  __
/ ___||  _ \|  \/  |
\___ \| |_) | |\/| |
 ___) |  __/| |  | |
|____/|_|   |_|  |_|
  StarlaneProxyManager
-------------------------------------
User:  $NPMUSER PUID:$PUID ID:$(id -u "$NPMUSER") GROUP:$(id -g "$NPMUSER")
Group: $NPMGROUP PGID:$PGID ID:$(get_group_id "$NPMGROUP")
-------------------------------------
"
