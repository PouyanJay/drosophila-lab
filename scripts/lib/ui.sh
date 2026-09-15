#!/usr/bin/env bash
# Dependency-free presentation for help and runtime bootstrap (Bash 3.2).
LAB_UI_RESET='' LAB_UI_CYAN='' LAB_UI_BOLD='' LAB_UI_DIM=''
if [[ -t 1 && -z "${NO_COLOR+x}" && "${TERM:-dumb}" != dumb ]]; then
  LAB_UI_RESET=$'\033[0m' LAB_UI_CYAN=$'\033[36m'
  LAB_UI_BOLD=$'\033[1m' LAB_UI_DIM=$'\033[2m'
fi
LAB_UI_COLUMNS=${COLUMNS:-80}
if [[ -t 1 ]] && command -v tput >/dev/null 2>&1; then
  LAB_UI_COLUMNS=$(tput cols 2>/dev/null || printf '80')
fi
lab_banner() {
  printf '\n  %s%sD R O S O P H I L A%s\n' "$LAB_UI_CYAN" "$LAB_UI_BOLD" "$LAB_UI_RESET"
  if [[ -t 1 && "${TERM:-dumb}" != dumb && "${LC_ALL:-${LC_CTYPE:-${LANG:-}}}" == *[Uu][Tt][Ff]* ]]; then
    printf '%s' "$LAB_UI_CYAN"
    printf '  ██╗      █████╗ ██████╗\n  ██║     ██╔══██╗██╔══██╗\n  ██║     ███████║██████╔╝\n  ██║     ██╔══██║██╔══██╗\n  ███████╗██║  ██║██████╔╝\n  ╚══════╝╚═╝  ╚═╝╚═════╝\n'
    printf '%s' "$LAB_UI_RESET"
  else
    printf '  L A B\n'
  fi
  printf '  %sConnectome research workspace%s\n' "$LAB_UI_DIM" "$LAB_UI_RESET"
  printf '\n  %smake %s%s\n\n' "$LAB_UI_BOLD" "$1" "$LAB_UI_RESET"
}
lab_section() { printf '\n  %s%s%s\n' "$LAB_UI_BOLD" "$1" "$LAB_UI_RESET"; }
lab_command() {
  if [[ "${LAB_UI_COLUMNS:-80}" =~ ^[0-9]+$ ]] && [[ "${LAB_UI_COLUMNS:-80}" -lt 70 ]]; then
    printf '    %s%s%s\n      %s\n' "$LAB_UI_CYAN" "$1" "$LAB_UI_RESET" "$2"
  else
    printf '    %s%-24s%s %s\n' "$LAB_UI_CYAN" "$1" "$LAB_UI_RESET" "$2"
  fi
}
