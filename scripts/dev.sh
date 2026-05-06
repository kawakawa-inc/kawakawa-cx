#!/usr/bin/env bash
#
# Dev process manager for Kawakawa CX
#
# Usage:
#   ./scripts/dev.sh start <service>   Start a service (bot, api, web, all)
#   ./scripts/dev.sh stop <service>    Stop a service (bot, api, web, all)
#   ./scripts/dev.sh restart <service> Restart a service
#   ./scripts/dev.sh reload <service>  Reload without full restart (tsx watch stdin trick)
#   ./scripts/dev.sh status            Show running services
#   ./scripts/dev.sh logs <service>    Tail logs for a service
#
# PID files are stored in .dev/pids/
# Logs are stored in .dev/logs/
# stdin FIFOs are stored in .dev/fifos/ (for reload support)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEV_DIR="$ROOT_DIR/.dev"
PID_DIR="$DEV_DIR/pids"
LOG_DIR="$DEV_DIR/logs"
FIFO_DIR="/tmp/kawakawa-dev"  # FIFOs need tmpfs (not supported on all filesystems)

SERVICES=(bot api web sync-worker)

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Ensure directories exist
mkdir -p "$PID_DIR" "$LOG_DIR" "$FIFO_DIR"

#
# Get the pnpm command for a service
#
get_service_cmd() {
  local service="$1"
  case "$service" in
    bot) echo "pnpm --filter @kawakawa/bot dev" ;;
    api) echo "pnpm --filter @kawakawa/api dev" ;;
    web) echo "pnpm --filter @kawakawa/web dev" ;;
    sync-worker) echo "pnpm --filter @kawakawa/sync-worker dev" ;;
    *) echo ""; return 1 ;;
  esac
}

#
# Get the process group pattern for pkill (fallback cleanup)
#
get_kill_pattern() {
  local service="$1"
  case "$service" in
    bot) echo "@kawakawa/bot|apps/bot.*tsx|pnpm.*bot dev" ;;
    api) echo "@kawakawa/api|apps/api.*tsx|pnpm.*api dev" ;;
    web) echo "@kawakawa/web|vite.*apps/web|pnpm.*web dev" ;;
    sync-worker) echo "@kawakawa/sync-worker|apps/sync-worker.*tsx|pnpm.*sync-worker dev" ;;
  esac
}

#
# Read PID from file, return empty if stale
#
read_pid() {
  local service="$1"
  local pidfile="$PID_DIR/$service.pid"
  if [[ -f "$pidfile" ]]; then
    local pid
    pid=$(cat "$pidfile")
    if kill -0 "$pid" 2>/dev/null; then
      # `kill -0` succeeds on zombies too — they have a PID but are already
      # dead, just unreaped. Treat them as not running so we don't waste the
      # 5s wait + SIGKILL (both no-ops on a zombie). A real init as PID 1
      # would reap them; without one, they linger until the container exits.
      local state
      state=$(ps -o stat= -p "$pid" 2>/dev/null | tr -d ' ')
      if [[ "$state" == Z* ]]; then
        rm -f "$pidfile"
        echo ""
      else
        echo "$pid"
      fi
    else
      # Stale PID file
      rm -f "$pidfile"
      echo ""
    fi
  else
    echo ""
  fi
}

#
# Check if a service is running
#
is_running() {
  local service="$1"
  local pid
  pid=$(read_pid "$service")
  [[ -n "$pid" ]]
}

#
# Start a service
#
start_service() {
  local service="$1"

  if is_running "$service"; then
    local pid
    pid=$(read_pid "$service")
    echo -e "${YELLOW}$service is already running (PID $pid)${NC}"
    return 0
  fi

  local cmd
  cmd=$(get_service_cmd "$service")
  if [[ -z "$cmd" ]]; then
    echo -e "${RED}Unknown service: $service${NC}"
    return 1
  fi

  local logfile="$LOG_DIR/$service.log"
  local pidfile="$PID_DIR/$service.pid"
  local fifo="$FIFO_DIR/$service.fifo"

  # Create FIFO for stdin (allows reload via writing to it)
  rm -f "$fifo"
  mkfifo "$fifo"

  # Keep the FIFO open for writing by opening a background fd
  # Without this, the reading end gets EOF when no writer is connected
  exec 3<>"$fifo"

  echo -e "${CYAN}Starting $service...${NC}"

  # Start the service with FIFO as stdin, logging stdout+stderr
  # Use setsid to create a new process group for clean shutdown
  cd "$ROOT_DIR"
  setsid bash -c "$cmd" < "$fifo" > "$logfile" 2>&1 &
  local pid=$!

  # Close our copy of the fd (the background process has its own)
  exec 3>&-

  # Write PID
  echo "$pid" > "$pidfile"

  # Wait briefly and check it's still running
  sleep 1
  if kill -0 "$pid" 2>/dev/null; then
    echo -e "${GREEN}$service started (PID $pid)${NC}"
    echo -e "  Logs: $logfile"
  else
    echo -e "${RED}$service failed to start. Check logs:${NC}"
    echo -e "  tail -20 $logfile"
    rm -f "$pidfile"
    return 1
  fi
}

#
# Stop a service
#
stop_service() {
  local service="$1"
  local pid
  pid=$(read_pid "$service")

  if [[ -z "$pid" ]]; then
    echo -e "${YELLOW}$service is not running (no PID file)${NC}"
    # Fallback: try to kill by pattern in case of orphaned processes
    cleanup_orphans "$service"
    return 0
  fi

  echo -e "${CYAN}Stopping $service (PID $pid)...${NC}"

  # Kill the process group (negative PID = process group)
  local pgid
  pgid=$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')

  if [[ -n "$pgid" && "$pgid" != "0" ]]; then
    kill -TERM "-$pgid" 2>/dev/null || true
  else
    kill -TERM "$pid" 2>/dev/null || true
  fi

  # Wait for exit (up to 5 seconds)
  local waited=0
  while kill -0 "$pid" 2>/dev/null && [[ $waited -lt 50 ]]; do
    sleep 0.1
    waited=$((waited + 1))
  done

  # Force kill if still running
  if kill -0 "$pid" 2>/dev/null; then
    echo -e "${YELLOW}Force killing $service...${NC}"
    if [[ -n "$pgid" && "$pgid" != "0" ]]; then
      kill -9 "-$pgid" 2>/dev/null || true
    else
      kill -9 "$pid" 2>/dev/null || true
    fi
    sleep 0.5
  fi

  # Clean up
  rm -f "$PID_DIR/$service.pid"
  rm -f "$FIFO_DIR/$service.fifo"

  # Also clean up any orphans
  cleanup_orphans "$service"

  echo -e "${GREEN}$service stopped${NC}"
}

#
# Clean up orphaned processes that aren't tracked by PID files
#
cleanup_orphans() {
  local service="$1"
  local pattern
  pattern=$(get_kill_pattern "$service")

  # Use pgrep to find matching processes for each sub-pattern
  local orphans=""
  IFS='|' read -ra PATTERNS <<< "$pattern"
  for p in "${PATTERNS[@]}"; do
    local pids
    pids=$(pgrep -f "$p" 2>/dev/null | grep -v "^$$\$" || true)
    if [[ -n "$pids" ]]; then
      orphans="$orphans $pids"
    fi
  done
  orphans=$(echo "$orphans" | tr ' ' '\n' | sort -u | tr '\n' ' ' | xargs)

  if [[ -n "$orphans" ]]; then
    echo -e "${YELLOW}Cleaning up orphaned $service processes...${NC}"
    echo "$orphans" | xargs kill -TERM 2>/dev/null || true
    sleep 1
    # Force kill any remaining
    local remaining=""
    for pid in $orphans; do
      if kill -0 "$pid" 2>/dev/null; then
        remaining="$remaining $pid"
      fi
    done
    if [[ -n "$remaining" ]]; then
      echo "$remaining" | xargs kill -9 2>/dev/null || true
    fi
  fi
}

#
# Reload a service (write to FIFO to trigger tsx watch reload)
#
reload_service() {
  local service="$1"

  if ! is_running "$service"; then
    echo -e "${YELLOW}$service is not running. Starting instead...${NC}"
    start_service "$service"
    return
  fi

  local fifo="$FIFO_DIR/$service.fifo"
  if [[ ! -p "$fifo" ]]; then
    echo -e "${YELLOW}No FIFO found for $service. Doing full restart...${NC}"
    stop_service "$service"
    start_service "$service"
    return
  fi

  echo -e "${CYAN}Reloading $service...${NC}"
  # Write a newline to the FIFO to trigger tsx watch reload
  echo "" > "$fifo" 2>/dev/null || {
    echo -e "${RED}Failed to write to FIFO. Doing full restart...${NC}"
    stop_service "$service"
    start_service "$service"
    return
  }

  echo -e "${GREEN}$service reload triggered${NC}"
}

#
# Show status of all services
#
show_status() {
  echo -e "${CYAN}Service Status:${NC}"
  echo ""
  for service in "${SERVICES[@]}"; do
    local pid
    pid=$(read_pid "$service")
    if [[ -n "$pid" ]]; then
      # Get memory usage
      local mem
      mem=$(ps -o rss= -p "$pid" 2>/dev/null | awk '{printf "%.0fMB", $1/1024}' || echo "?")
      # Get uptime
      local elapsed
      elapsed=$(ps -o etimes= -p "$pid" 2>/dev/null | tr -d ' ' || echo "0")
      local uptime_str
      if [[ "$elapsed" -gt 3600 ]]; then
        uptime_str="$((elapsed / 3600))h$((elapsed % 3600 / 60))m"
      elif [[ "$elapsed" -gt 60 ]]; then
        uptime_str="$((elapsed / 60))m$((elapsed % 60))s"
      else
        uptime_str="${elapsed}s"
      fi
      echo -e "  ${GREEN}●${NC} $service  PID=$pid  mem=$mem  up=$uptime_str"
    else
      echo -e "  ${RED}○${NC} $service  (stopped)"
    fi
  done
  echo ""

  # Check for orphaned processes (not descendants of tracked PID)
  local orphans_found=false
  for service in "${SERVICES[@]}"; do
    local pattern
    pattern=$(get_kill_pattern "$service")
    local tracked_pid
    tracked_pid=$(read_pid "$service")

    # Get all descendants of tracked PID (if running)
    local descendants=""
    if [[ -n "$tracked_pid" ]]; then
      descendants=$(pgrep -P "$tracked_pid" 2>/dev/null || true)
      # Also get grandchildren etc.
      local to_check="$tracked_pid"
      for _ in 1 2 3 4; do
        local children=""
        for p in $to_check; do
          local kids
          kids=$(pgrep -P "$p" 2>/dev/null || true)
          children="$children $kids"
        done
        children=$(echo "$children" | xargs)
        if [[ -z "$children" ]]; then break; fi
        descendants="$descendants $children"
        to_check="$children"
      done
      descendants="$tracked_pid $descendants"
    fi

    # Find all matching PIDs
    local all_pids=""
    IFS='|' read -ra PATTERNS <<< "$pattern"
    for p in "${PATTERNS[@]}"; do
      local pids
      pids=$(pgrep -f "$p" 2>/dev/null || true)
      all_pids="$all_pids $pids"
    done
    all_pids=$(echo "$all_pids" | tr ' ' '\n' | sort -u | grep -v '^$' || true)

    # Count orphans (PIDs not in the descendants list)
    local orphan_count=0
    for p in $all_pids; do
      if ! echo " $descendants " | grep -q " $p "; then
        orphan_count=$((orphan_count + 1))
      fi
    done

    if [[ "$orphan_count" -gt 0 ]]; then
      if ! $orphans_found; then
        echo -e "${YELLOW}Warning: Orphaned processes detected:${NC}"
        orphans_found=true
      fi
      echo -e "  $service: $orphan_count orphaned process(es)"
    fi
  done
  if $orphans_found; then
    echo -e "  Run '${CYAN}./scripts/dev.sh stop <service>${NC}' to clean up"
  fi
}

#
# Tail logs for a service
#
tail_logs() {
  local service="$1"
  local logfile="$LOG_DIR/$service.log"

  if [[ ! -f "$logfile" ]]; then
    echo -e "${YELLOW}No log file found for $service${NC}"
    return 1
  fi

  echo -e "${CYAN}Tailing $service logs (Ctrl+C to stop):${NC}"
  tail -f "$logfile"
}

#
# Main command dispatch
#
main() {
  local action="${1:-help}"
  local target="${2:-}"

  case "$action" in
    start)
      if [[ "$target" == "all" || -z "$target" ]]; then
        for service in "${SERVICES[@]}"; do
          start_service "$service"
        done
      else
        start_service "$target"
      fi
      ;;

    stop)
      if [[ "$target" == "all" || -z "$target" ]]; then
        for service in "${SERVICES[@]}"; do
          stop_service "$service"
        done
      else
        stop_service "$target"
      fi
      ;;

    restart)
      if [[ "$target" == "all" || -z "$target" ]]; then
        for service in "${SERVICES[@]}"; do
          stop_service "$service"
          start_service "$service"
        done
      else
        stop_service "$target"
        start_service "$target"
      fi
      ;;

    reload)
      if [[ -z "$target" ]]; then
        echo -e "${RED}Usage: dev.sh reload <service>${NC}"
        return 1
      fi
      reload_service "$target"
      ;;

    status|st)
      show_status
      ;;

    logs)
      if [[ -z "$target" ]]; then
        echo -e "${RED}Usage: dev.sh logs <service>${NC}"
        return 1
      fi
      tail_logs "$target"
      ;;

    help|--help|-h)
      echo "Kawakawa CX Dev Process Manager"
      echo ""
      echo "Usage: ./scripts/dev.sh <command> [service]"
      echo ""
      echo "Commands:"
      echo "  start [service]    Start service(s) (bot, api, web, all)"
      echo "  stop [service]     Stop service(s)"
      echo "  restart [service]  Stop then start service(s)"
      echo "  reload <service>   Hot-reload via tsx watch stdin"
      echo "  status             Show all service statuses"
      echo "  logs <service>     Tail service logs"
      echo ""
      echo "Services: bot, api, web (default: all)"
      echo ""
      echo "Files:"
      echo "  .dev/pids/   PID files"
      echo "  .dev/logs/   Service logs"
      echo "  .dev/fifos/  stdin FIFOs (for reload)"
      ;;

    *)
      echo -e "${RED}Unknown command: $action${NC}"
      echo "Run './scripts/dev.sh help' for usage"
      return 1
      ;;
  esac
}

main "$@"
