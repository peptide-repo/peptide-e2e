#!/usr/bin/env bash
# install-orchestrator.sh — One-time setup for the PRAB generation orchestrator on the VPS.
#
# Installs:
#   1. orchestrate-generation.sh  -> /opt/prab-orchestrator/ (from this repo)
#   2. prab-generation.service    -> /etc/systemd/system/
#   3. prab-generation.timer      -> /etc/systemd/system/
#
# Does NOT enable or start the timer — that is an explicit post-QA cutover step.
# Does NOT write secrets — the SSH key at /root/.ssh/hostinger_prod_ed25519 must
# already be present (placed manually by the CTO from .env.credentials).
#
# Run as root on the KVM8 VPS (76.13.220.15):
#   bash infra/vps/install-orchestrator.sh
#
# After install, validate with DRY_RUN=1 before enabling the timer:
#   DRY_RUN=1 /opt/prab-orchestrator/orchestrate-generation.sh
#   systemctl enable --now prab-generation.timer   # only after CEO greenlight

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="/opt/prab-orchestrator"
SYSTEMD_DIR="/etc/systemd/system"
ORCHESTRATE_SH="${SCRIPT_DIR}/orchestrate-generation.sh"
SERVICE_FILE="${SCRIPT_DIR}/prab-generation.service"
TIMER_FILE="${SCRIPT_DIR}/prab-generation.timer"

# Must be root.
if [[ "$(id -u)" -ne 0 ]]; then
  echo "ERROR: install-orchestrator.sh must be run as root." >&2
  exit 1
fi

# Validate source files exist.
for f in "${ORCHESTRATE_SH}" "${SERVICE_FILE}" "${TIMER_FILE}"; do
  if [[ ! -f "$f" ]]; then
    echo "ERROR: source file not found: $f" >&2
    exit 1
  fi
done

echo "Installing PRAB orchestrator to ${INSTALL_DIR}..."
mkdir -p "${INSTALL_DIR}"
install -m 0750 "${ORCHESTRATE_SH}" "${INSTALL_DIR}/orchestrate-generation.sh"
echo "  OK: ${INSTALL_DIR}/orchestrate-generation.sh"

# Pre-seed known_hosts with Hostinger's host key so ssh(1) can verify
# the server identity without StrictHostKeyChecking=no.
# ssh-keyscan output is pinned here; re-run if Hostinger rotates its key.
KNOWN_HOSTS_FILE="${INSTALL_DIR}/known_hosts"
if [[ ! -f "${KNOWN_HOSTS_FILE}" ]]; then
  echo "Pre-seeding known_hosts from Hostinger (${SSH_HOST:-145.223.107.228}:${SSH_PORT:-65002})..."
  ssh-keyscan -p "${SSH_PORT:-65002}" "${SSH_HOST:-145.223.107.228}" \
    > "${KNOWN_HOSTS_FILE}" 2>/dev/null \
    && chmod 0600 "${KNOWN_HOSTS_FILE}" \
    && echo "  OK: ${KNOWN_HOSTS_FILE}" \
    || echo "  WARN: ssh-keyscan failed — known_hosts not seeded; first SSH will add key via accept-new"
else
  echo "  OK: ${KNOWN_HOSTS_FILE} (already exists, not overwritten)"
fi

echo "Installing systemd units..."
install -m 0644 "${SERVICE_FILE}" "${SYSTEMD_DIR}/prab-generation.service"
install -m 0644 "${TIMER_FILE}" "${SYSTEMD_DIR}/prab-generation.timer"
echo "  OK: ${SYSTEMD_DIR}/prab-generation.service"
echo "  OK: ${SYSTEMD_DIR}/prab-generation.timer"

systemctl daemon-reload
echo "  OK: systemctl daemon-reload"

echo ""
echo "Install complete. Timer is installed but NOT enabled."
echo "Next steps (post-QA + CEO greenlight only):"
echo "  1. Ensure SSH key exists: ls -la /root/.ssh/hostinger_prod_ed25519"
echo "  2. Validate with dry run: DRY_RUN=1 /opt/prab-orchestrator/orchestrate-generation.sh"
echo "  3. Run first real invocation: /opt/prab-orchestrator/orchestrate-generation.sh"
echo "  4. Enable timer: systemctl enable --now prab-generation.timer"
echo "  5. Confirm next run: systemctl list-timers prab-generation.timer"
