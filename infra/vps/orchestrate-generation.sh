#!/usr/bin/env bash
# orchestrate-generation.sh — VPS orchestrator for PRAutoBlogger article generation
#
# Runs as a systemd oneshot service (prab-generation.service) on the Coolify KVM8 VPS.
# SSHes to Hostinger and drives wp prautoblogger generate --sync in a held-open SSH
# session. SSH-attached processes survive Hostinger's ~10-min background-PHP-process kill.
#
# Usage:
#   DRY_RUN=1 ./orchestrate-generation.sh   # echo commands, no generation
#   ./orchestrate-generation.sh             # real run
#
# Alerting: on failure, sends email to cto@peptiderepo.com via system mail.
# Logs:     structured log lines to stdout (captured by systemd journal).
# Lock:     the plugin's Generation_Lock (DB mutex) prevents double-drive.
#
# Environment variables:
#   DRY_RUN       Set to "1" to echo SSH/WP-CLI commands without executing. Default: 0.
#   LOGFILE       Path for persistent log file. Default: /var/log/prab-generation.log.
#   ALERT_EMAIL   Failure alert recipient. Default: cto@peptiderepo.com.
#   SSH_KEY       Path to Hostinger SSH private key. Default: /root/.ssh/hostinger_prod_ed25519.
#   SSH_HOST      Hostinger SSH host. Default: 145.223.107.228.
#   SSH_PORT      Hostinger SSH port. Default: 65002.
#   SSH_USER      Hostinger SSH user. Default: u117248512.
#   WP_PATH       WordPress docroot on Hostinger. Default: /home/u117248512/domains/peptiderepo.com/public_html.

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration (override via environment; no hardcoded secrets)
# ---------------------------------------------------------------------------
DRY_RUN="${DRY_RUN:-0}"
LOGFILE="${LOGFILE:-/var/log/prab-generation.log}"
ALERT_EMAIL="${ALERT_EMAIL:-cto@peptiderepo.com}"
SSH_KEY="${SSH_KEY:-/root/.ssh/hostinger_prod_ed25519}"
SSH_HOST="${SSH_HOST:-145.223.107.228}"
SSH_PORT="${SSH_PORT:-65002}"
SSH_USER="${SSH_USER:-u117248512}"
WP_PATH="${WP_PATH:-/home/u117248512/domains/peptiderepo.com/public_html}"
# Known-hosts file pre-seeded by install-orchestrator.sh with Hostinger's host key.
# Pins the server identity; StrictHostKeyChecking=accept-new adds on first connect.
KNOWN_HOSTS="${KNOWN_HOSTS:-/opt/prab-orchestrator/known_hosts}"

# ---------------------------------------------------------------------------
# Logging helpers
# ---------------------------------------------------------------------------
PID="$$"
TS() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }

log() {
  local msg="prab-generation[${PID}]: $*"
  echo "$msg"
  echo "$(TS) $msg" >> "${LOGFILE}" 2>/dev/null || true
}

die() {
  log "FATAL: $*"
  exit 1
}

# ---------------------------------------------------------------------------
# Validate required key before doing anything
# ---------------------------------------------------------------------------
if [[ "${DRY_RUN}" != "1" ]] && [[ ! -f "${SSH_KEY}" ]]; then
  die "SSH key not found at ${SSH_KEY}. Run install-orchestrator.sh first."
fi

# ---------------------------------------------------------------------------
# DRY_RUN mode: echo commands and exit
# ---------------------------------------------------------------------------
if [[ "${DRY_RUN}" == "1" ]]; then
  log "DRY_RUN=1 — echoing commands only, no generation"
  log "WOULD RUN: ssh -i ${SSH_KEY} -p ${SSH_PORT} -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 ${SSH_USER}@${SSH_HOST} \\"
  log "  'wp prautoblogger generate --sync --path=${WP_PATH} 2>&1'"
  log "DRY_RUN complete"
  exit 0
fi

# ---------------------------------------------------------------------------
# Run start
# ---------------------------------------------------------------------------
START_TS="$(TS)"
log "START ts=${START_TS}"

# ---------------------------------------------------------------------------
# Step 1: Reaper sweep — clear any stuck runs before starting.
# Belt-and-suspenders: the plugin's daily reaper cron handles this too, but
# running it explicitly here ensures a clean state before each generation.
# ---------------------------------------------------------------------------
log "REAPER_SWEEP: invoking Run_Reaper::reap()"
REAP_CMD="wp eval 'echo json_encode(PRAutoBlogger_Run_Reaper::reap());' --path=${WP_PATH} 2>&1"

REAP_OUT=""
# shellcheck disable=SC2029
REAP_OUT="$(ssh -i "${SSH_KEY}" \
    -p "${SSH_PORT}" \
    -o StrictHostKeyChecking=accept-new \
    -o UserKnownHostsFile="${KNOWN_HOSTS}" \
    -o ConnectTimeout=15 \
    -o ServerAliveInterval=60 \
    -o ServerAliveCountMax=30 \
    "${SSH_USER}@${SSH_HOST}" \
    "${REAP_CMD}" \
    2>&1)" || true
log "REAPER_RESULT: ${REAP_OUT}"

# ---------------------------------------------------------------------------
# Step 2: Run wp prautoblogger generate --sync
# ---------------------------------------------------------------------------
log "SSH_CONNECT: ${SSH_USER}@${SSH_HOST}:${SSH_PORT} key=${SSH_KEY}"

WP_CMD="wp prautoblogger generate --sync --path=${WP_PATH} 2>&1"

RESULT_OUTPUT=""
EXIT_CODE=0

# shellcheck disable=SC2029
RESULT_OUTPUT="$(ssh -i "${SSH_KEY}" \
    -p "${SSH_PORT}" \
    -o StrictHostKeyChecking=accept-new \
    -o UserKnownHostsFile="${KNOWN_HOSTS}" \
    -o ConnectTimeout=15 \
    -o ServerAliveInterval=60 \
    -o ServerAliveCountMax=30 \
    "${SSH_USER}@${SSH_HOST}" \
    "${WP_CMD}" \
    2>&1)" || EXIT_CODE=$?

# Extract the last JSON summary line (the one from WP_CLI::log(json_encode(...)))
LAST_JSON="$(echo "${RESULT_OUTPUT}" | grep -E '^\{' | tail -1 || true)"
LAST_LINE="$(echo "${RESULT_OUTPUT}" | tail -1)"

log "SSH_RESULT exit=${EXIT_CODE} json=${LAST_JSON:-none}"

# ---------------------------------------------------------------------------
# Step 3: Evaluate result
# ---------------------------------------------------------------------------
END_TS="$(TS)"

if [[ ${EXIT_CODE} -eq 0 ]]; then
  log "END result=success ts=${END_TS}"
else
  log "END result=failure exit=${EXIT_CODE} last_line=${LAST_LINE} ts=${END_TS}"

  # Send failure alert via email (system mail; no external deps required).
  # cto@peptiderepo.com forwards to peptiderepo@gmail.com via Cloudflare Email Routing.
  ALERT_BODY="PRAutoBlogger generation FAILED on $(hostname) at ${END_TS}.
Exit code: ${EXIT_CODE}
Last output: ${LAST_LINE}
Full log: ${LOGFILE}
SSH: ${SSH_USER}@${SSH_HOST}:${SSH_PORT}
WP path: ${WP_PATH}"

  echo "${ALERT_BODY}" \
    | mail -s "PRAB generation FAILED @ ${END_TS}" "${ALERT_EMAIL}" 2>/dev/null \
    || log "ALERT_FAILED: could not send email to ${ALERT_EMAIL} (mail not configured?)"

  exit "${EXIT_CODE}"
fi
