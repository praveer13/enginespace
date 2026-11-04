#!/bin/sh
# enginespace guard: a Claude Code PreToolUse hook that keeps the lab's TODO(you) file yours to write.
#
#   sh es-guard.sh <protected-file>      (path relative to the workspace root; the hook JSON is on stdin)
# >>> enginespace
#   sh es-guard.sh --harness <protected-file>
#                                        the same guard for the grading harness, whose message says it stays as shipped;
#                                        settings.json runs the script once for the TODO(you) file and once for the harness
# <<< enginespace
#
# Friction, not DRM. It fails closed: anything it cannot parse, and any unexpected failure, exits 2
# (block). Exit 0 allows. If this script cannot run at all (no sh), Claude Code treats that as
# non-blocking and the permissions.deny rule in settings.json still stops Edit and Write.
# ES_SOLO=0 turns the guard off. POSIX sh and grep/sed/tr only, no jq.

es_done=0
trap '[ "$es_done" = 1 ] || exit 2' EXIT
set -f

# >>> enginespace
kind=todo
if [ "${1:-}" = --harness ]; then
  kind=harness
  shift
fi
# <<< enginespace
protected=${1:-}
if [ -z "$protected" ]; then
  echo 'enginespace: es-guard.sh was started without a protected file, so it blocks everything. Re-extract the lab zip.' >&2
  exit 2
fi
base=${protected##*/}
base_re=$(printf '%s' "$base" | sed 's/[^A-Za-z0-9_-]/\\&/g')

allow() {
  es_done=1
  exit 0
}

deny() {
  # >>> enginespace
  if [ "$kind" = harness ]; then
    echo "enginespace: $protected is the lab's grading harness, and it stays as shipped. Ask about the failing check instead: name it, its invariant and your hypothesis. Set ES_SOLO=0 to turn this guard off." >&2
    exit 2
  fi
  # <<< enginespace
  echo "enginespace: $protected is yours to write. Ask about the failing check instead: name it, its invariant and your hypothesis. Set ES_SOLO=0 to turn this guard off." >&2
  exit 2
}

if [ "${ES_SOLO:-}" = 0 ]; then
  allow
fi

payload=$(cat) || deny
flat=$(printf '%s' "$payload" | tr -d ' \t\r\n')
case $flat in
  '{'*'"tool_name":"'*'}') ;;
  *) deny ;;
esac
# strings out, then every brace and bracket must pair off: a truncated or mangled payload is unparseable
skeleton=$(printf '%s' "$flat" | sed -E 's/"([^"\\]|\\.)*"//g' | tr -cd '{}[]"')
case $skeleton in *'"'*) deny ;; esac
prev=x
while [ "$skeleton" != "$prev" ]; do
  prev=$skeleton
  skeleton=$(printf '%s' "$skeleton" | sed -e 's/{}//g' -e 's/\[\]//g')
done
[ -z "$skeleton" ] || deny

# every "<key>":"<string>" pair for the given keys; escaped quotes inside a string never match a key
pairs() {
  printf '%s' "$payload" | tr '\n\r' '  ' | grep -oE "\"($1)\"[[:space:]]*:[[:space:]]*\"([^\"\\\\]|\\\\.)*\""
}
# the string value of each pair, JSON separators folded to '/'
values() {
  sed -E 's/^"[A-Za-z_]*"[[:space:]]*:[[:space:]]*"(.*)"$/\1/' | sed -e 's/\\\\/\//g' -e 's/\\\//\//g'
}

tools=$(pairs tool_name | values)
is_edit=0
is_bash=0
is_mcp=0
for t in $tools; do
  case $t in
    Edit | Write | MultiEdit | NotebookEdit) is_edit=1 ;;
    Bash) is_bash=1 ;;
    mcp__*) is_mcp=1 ;;
  esac
done

if [ "$is_edit" = 1 ]; then
  paths=$(pairs 'file_path|notebook_path|path' | values)
  [ -n "$paths" ] || deny
  case $paths in *'\u'*) deny ;; esac
  if printf '%s\n' "$paths" | grep -Eiq "(^|/)${base_re}\$"; then
    deny
  fi
fi

# read-only commands only: no chaining, redirection or substitution, and every pipe stage on the list
readonly_cmd() {
  case $1 in
    *';'* | *'&'* | *'>'* | *'<'* | *'`'* | *'$('* | *'\n'* | *'\u'* | *'\r'*) return 1 ;;
  esac
  rc_ifs=$IFS
  IFS='
'
  for stage in $(printf '%s' "$1" | tr '|' '\n'); do
    if ! printf '%s' "$stage" | grep -Eq '^[[:space:]]*(cat|head|tail|less|grep|rg|wc|git[[:space:]]+(diff|log|show|status)|cargo[[:space:]]+(test|build|check|clippy))([[:space:]]|$)'; then
      IFS=$rc_ifs
      return 1
    fi
  done
  IFS=$rc_ifs
  return 0
}

if [ "$is_bash" = 1 ]; then
  cmds=$(pairs command | values)
  [ -n "$cmds" ] || deny
  old_ifs=$IFS
  IFS='
'
  for c in $cmds; do
    if printf '%s' "$c" | grep -Fqi -- "$base"; then
      readonly_cmd "$c" || deny
    fi
  done
  IFS=$old_ifs
fi

if [ "$is_mcp" = 1 ]; then
  input=$(printf '%s' "$payload" | tr '\n\r' '  ' | grep -oE '"tool_input".*' | head -n 1)
  [ -n "$input" ] || input=$payload
  if printf '%s' "$input" | grep -Fqi -- "$base"; then
    deny
  fi
fi

allow
