#!/usr/bin/env bash
# Compressed swap for the tiny demo VM; existing disk swap remains available.
set -euo pipefail
if [ "$(uname -s)" != Linux ] || [ "$(id -u)" != 0 ]; then
  echo 'Run this only as root on the Linux demo VM.'
  exit 1
fi
if [ "${1:-}" != --activate ]; then
  install -m 0755 "$0" /usr/local/sbin/afr-demo-memory
  cat > /etc/systemd/system/afr-demo-memory.service <<'UNIT'
[Unit]
Description=Compressed swap for the Agent Flight Recorder demo
After=systemd-modules-load.service
Before=docker.service
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/afr-demo-memory --activate
RemainAfterExit=yes
[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable --now afr-demo-memory.service
  exit 0
fi
if [ -f /sys/module/zswap/parameters/enabled ]; then
  # Azure's minimal kernel includes zswap but omits the optional zram module.
  echo 25 > /sys/module/zswap/parameters/max_pool_percent
  echo Y > /sys/module/zswap/parameters/enabled
  echo 'Enabled the compressed zswap cache; backing disk swap remains active.'
else
  modprobe zram num_devices=1
  if ! swapon --noheadings --show=NAME | grep -qx /dev/zram0; then
    if [ "$(cat /sys/block/zram0/disksize)" != 0 ]; then
      echo 'Refusing to modify an existing initialized zram device.'
      exit 1
    fi
    echo lz4 > /sys/block/zram0/comp_algorithm
    # At most 512 MiB uncompressed; allocate memory only for compressed pages.
    echo 512M > /sys/block/zram0/disksize
    mkswap /dev/zram0
    swapon --priority 100 /dev/zram0
  fi
fi
cat > /etc/sysctl.d/90-afr-demo.conf <<'SYSCTL'
vm.swappiness=80
vm.page-cluster=0
SYSCTL
sysctl -p /etc/sysctl.d/90-afr-demo.conf
swapon --show
