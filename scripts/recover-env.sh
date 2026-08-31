#!/usr/bin/env bash

set -Eeuo pipefail

INSTALL_DIR="${PW_INSTALL_DIR:-}"
INSTALL_DIR_EXPLICIT=0
APPLY=0

INSTALL_REAL=""
ENV_FILE=""
TEMP_FILE=""
RECOVERY_FAILED=0

KEYS=(
  POSTGRES_PASSWORD
  NATS_PASSWORD
  JWT_SECRET
  S3_SECRET_KEY
  QDRANT_API_KEY
  REDIS_PASSWORD
  ADMIN_PASSWORD
)
RECOVERED_VALUES=()
WRITTEN=()
KEY_INDEX=-1

log() {
  printf '[recover-env] %s\n' "$*"
}

warn() {
  printf '[recover-env] 警告：%s\n' "$*" >&2
}

die() {
  printf '[recover-env] 错误：%s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
从现有 PandaWiki 容器恢复安装目录中的 .env 密码。

用法：
  sudo ./scripts/recover-env.sh [选项]

选项：
  --install-dir DIR   PandaWiki 安装目录；默认从容器或 /data/pandawiki 检测
  --apply             备份当前 .env，并将恢复结果原子写回
  -h, --help          显示帮助

先检查能否恢复（不会修改文件）：
  sudo ./scripts/recover-env.sh --install-dir /data/pandawiki

确认全部变量均显示 [可恢复] 后再写回：
  sudo ./scripts/recover-env.sh --install-dir /data/pandawiki --apply

安全说明：
  - 脚本不会在终端打印任何密码明文。
  - 多个容器中的同一密码不一致时，脚本拒绝自动选择。
  - 写回前会保留 .env.before-recovery-时间戳 备份。
  - 脚本不会自动重启或重建容器。
EOF
}

cleanup() {
  if [[ -n "$TEMP_FILE" && -f "$TEMP_FILE" ]]; then
    rm -f -- "$TEMP_FILE"
  fi
}

trap cleanup EXIT

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --install-dir)
        [[ $# -ge 2 ]] || die "--install-dir 后需要目录"
        INSTALL_DIR="$2"
        INSTALL_DIR_EXPLICIT=1
        shift 2
        ;;
      --apply)
        APPLY=1
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *) die "未知参数：$1" ;;
    esac
  done
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "缺少命令：$1"
}

detect_install_dir() {
  local detected=""

  if [[ -n "$INSTALL_DIR" ]]; then
    return 0
  fi

  detected="$(docker inspect panda-wiki-api \
    --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}' \
    2>/dev/null || true)"
  if [[ -n "$detected" && "$detected" != "<no value>" ]]; then
    INSTALL_DIR="$detected"
    return 0
  fi

  if [[ -f /data/pandawiki/docker-compose.yml ]]; then
    INSTALL_DIR="/data/pandawiki"
    return 0
  fi

  die "未找到 PandaWiki 安装目录，请通过 --install-dir 明确指定"
}

resolve_install_dir() {
  [[ "$INSTALL_DIR" == /* ]] || die "安装目录必须是绝对路径：$INSTALL_DIR"
  [[ -d "$INSTALL_DIR" ]] || die "安装目录不存在：$INSTALL_DIR"
  INSTALL_REAL="$(cd "$INSTALL_DIR" && pwd -P)"
  [[ -f "$INSTALL_REAL/docker-compose.yml" ]] || \
    die "安装目录中缺少 docker-compose.yml：$INSTALL_REAL"
  ENV_FILE="$INSTALL_REAL/.env"
  [[ -f "$ENV_FILE" ]] || die "没有找到待恢复文件：$ENV_FILE"
}

container_env() {
  local container="$1" variable="$2" output line

  docker inspect "$container" >/dev/null 2>&1 || return 1
  output="$(docker inspect "$container" \
    --format '{{range .Config.Env}}{{println .}}{{end}}')"
  while IFS= read -r line; do
    case "$line" in
      "$variable="*)
        printf '%s' "${line#*=}"
        return 0
        ;;
    esac
  done <<< "$output"
  return 1
}

recover_variable() {
  local key="$1"
  shift
  local spec container variable value chosen="" sources="" conflict=0 found=0

  for spec in "$@"; do
    container="${spec%%:*}"
    variable="${spec#*:}"
    if value="$(container_env "$container" "$variable")" && [[ -n "$value" ]]; then
      found=$((found + 1))
      if [[ -z "$sources" ]]; then
        sources="$container"
      else
        sources="$sources, $container"
      fi
      if [[ -z "$chosen" ]]; then
        chosen="$value"
      elif [[ "$chosen" != "$value" ]]; then
        conflict=1
      fi
    fi
  done

  if [[ "$found" -eq 0 ]]; then
    printf '[缺失]   %-20s 没有可用的旧容器值\n' "$key"
    RECOVERY_FAILED=1
    return 0
  fi
  if [[ "$conflict" -eq 1 ]]; then
    printf '[冲突]   %-20s 容器值不一致：%s\n' "$key" "$sources"
    RECOVERY_FAILED=1
    return 0
  fi

  key_index "$key" || die "内部错误：未知恢复变量 $key"
  RECOVERED_VALUES[$KEY_INDEX]="$chosen"
  printf '[可恢复] %-20s 来源：%s\n' "$key" "$sources"
}

recover_all() {
  recover_variable POSTGRES_PASSWORD \
    panda-wiki-api:POSTGRES_PASSWORD \
    panda-wiki-consumer:POSTGRES_PASSWORD \
    panda-wiki-postgres:POSTGRES_PASSWORD \
    panda-wiki-raglite:DATABASE_POSTGRESQL_PASSWORD

  recover_variable NATS_PASSWORD \
    panda-wiki-api:NATS_PASSWORD \
    panda-wiki-consumer:NATS_PASSWORD \
    panda-wiki-raglite:NATS_PASSWORD \
    panda-wiki-crawler:MQ_NATS_PASSWORD

  recover_variable JWT_SECRET \
    panda-wiki-api:JWT_SECRET \
    panda-wiki-consumer:JWT_SECRET

  recover_variable S3_SECRET_KEY \
    panda-wiki-api:S3_SECRET_KEY \
    panda-wiki-consumer:S3_SECRET_KEY \
    panda-wiki-minio:MINIO_SECRET_KEY \
    panda-wiki-crawler:OSS_MINIO_SECRET_KEY \
    panda-wiki-raglite:STORAGE_MINIO_SECRET_ACCESS_KEY

  recover_variable QDRANT_API_KEY \
    panda-wiki-qdrant:QDRANT__SERVICE__API_KEY \
    panda-wiki-raglite:DATABASE_QDRANT_API_KEY

  recover_variable REDIS_PASSWORD \
    panda-wiki-api:REDIS_PASSWORD \
    panda-wiki-consumer:REDIS_PASSWORD

  recover_variable ADMIN_PASSWORD \
    panda-wiki-api:ADMIN_PASSWORD
}

key_index() {
  local candidate="$1" key
  local index=0
  for key in "${KEYS[@]}"; do
    if [[ "$candidate" == "$key" ]]; then
      KEY_INDEX="$index"
      return 0
    fi
    index=$((index + 1))
  done
  return 1
}

write_candidate() {
  local line key index

  umask 077
  TEMP_FILE="$(mktemp "$INSTALL_REAL/.env.recovered.XXXXXX")"
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" =~ ^([A-Z_][A-Z0-9_]*)= ]]; then
      key="${BASH_REMATCH[1]}"
      if key_index "$key"; then
        index="$KEY_INDEX"
        printf '%s=%s\n' "$key" "${RECOVERED_VALUES[$index]:-}" >> "$TEMP_FILE"
        WRITTEN[$index]=1
        continue
      fi
    fi
    printf '%s\n' "$line" >> "$TEMP_FILE"
  done < "$ENV_FILE"

  index=0
  for key in "${KEYS[@]}"; do
    if [[ -z "${WRITTEN[$index]:-}" ]]; then
      printf '%s=%s\n' "$key" "${RECOVERED_VALUES[$index]:-}" >> "$TEMP_FILE"
    fi
    index=$((index + 1))
  done
}

validate_candidate() {
  local compose_files=(-f docker-compose.yml)
  if [[ -f "$INSTALL_REAL/compose.custom.yml" ]]; then
    compose_files+=(-f compose.custom.yml)
  fi

  if ! (
    cd "$INSTALL_REAL"
    docker compose --env-file "$TEMP_FILE" \
      "${compose_files[@]}" config --quiet
  ); then
    die "恢复后的候选文件无法通过 Docker Compose 校验，未修改原 .env"
  fi
}

apply_recovery() {
  local backup

  backup="$INSTALL_REAL/.env.before-recovery-$(date +%Y%m%d%H%M%S)"
  [[ ! -e "$backup" ]] || die "备份文件已存在：$backup"

  write_candidate
  validate_candidate
  cp -p -- "$ENV_FILE" "$backup"
  chmod 600 "$backup"
  chmod 600 "$TEMP_FILE"
  mv -- "$TEMP_FILE" "$ENV_FILE"
  TEMP_FILE=""

  log "已恢复：$ENV_FILE"
  log "原文件备份：$backup"
  log "尚未重启或重建任何容器"
  printf '\n请先检查服务状态：\n'
  printf '  cd %q && docker compose ps\n' "$INSTALL_REAL"
  printf '确认后再让 Compose 收敛配置：\n'
  printf '  cd %q && docker compose up -d\n' "$INSTALL_REAL"
}

main() {
  parse_args "$@"
  [[ "$EUID" -eq 0 ]] || die "请使用 sudo 或 root 权限运行"
  require_command docker
  docker compose version >/dev/null 2>&1 || die "Docker Compose 不可用"

  detect_install_dir
  resolve_install_dir
  log "检查安装目录：$INSTALL_REAL"
  recover_all

  if [[ "$RECOVERY_FAILED" -ne 0 ]]; then
    die "容器中的密码不完整或存在冲突，未修改 .env；不要重建或删除现有容器"
  fi

  if [[ "$APPLY" -eq 0 ]]; then
    printf '\n全部初始化密码均可从现有容器一致恢复。当前没有修改文件。\n'
    printf '确认后执行：\n'
    if [[ "$INSTALL_DIR_EXPLICIT" -eq 1 ]]; then
      printf '  sudo %q --install-dir %q --apply\n' "$0" "$INSTALL_REAL"
    else
      printf '  sudo %q --apply\n' "$0"
    fi
    exit 0
  fi

  apply_recovery
}

main "$@"
