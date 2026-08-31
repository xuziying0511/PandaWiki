#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

INSTALL_DIR="${PW_INSTALL_DIR:-}"
INSTALL_DIR_EXPLICIT=0
BACKUP_MODE="prompt"
BACKUP_DIR=""
IMAGE_MODE="prompt"
SOURCE_MODE="prompt"
SOURCE_DIR="$REPO_DIR"
ASSUME_YES=0
RUNTIME_DIR="/run/pandawiki"

INSTALL_REAL=""
SOURCE_REAL=""
COMPOSE_FILES=()
IMAGES=()

log() {
  printf '[uninstall] %s\n' "$*"
}

warn() {
  printf '[uninstall] 警告：%s\n' "$*" >&2
}

die() {
  printf '[uninstall] 错误：%s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
完整卸载 PandaWiki 的容器、网络、数据卷、运行时目录和安装目录。

用法：
  sudo ./scripts/uninstall.sh [选项]

选项：
  --install-dir DIR   PandaWiki 安装目录；默认从容器或 /data/pandawiki 检测
  --backup-dir DIR    卸载前将安装目录备份为 tar.gz
  --no-backup         明确跳过备份
  --remove-images     删除当前 Compose 配置引用的镜像
  --keep-images       保留镜像
  --remove-source     同时删除源码目录
  --keep-source       保留源码目录
  --source-dir DIR    指定要删除/保留的源码目录，默认是本脚本所在仓库
  --yes               跳过最终人工确认；必须同时明确其他所有选项
  -h, --help          显示帮助

交互式完整卸载：
  sudo ./scripts/uninstall.sh

非交互式完整卸载（不备份）：
  sudo ./scripts/uninstall.sh \
    --install-dir /data/pandawiki \
    --no-backup --remove-images --remove-source --yes

说明：
  - 卸载不会删除 Docker 本身，也不会执行 docker system prune。
  - --remove-images 只处理该项目当前 Compose 配置引用的镜像。
  - 外部数据库、对象存储、反向代理和 DNS 配置不在清理范围内。
EOF
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "缺少命令：$1"
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --install-dir)
        [[ $# -ge 2 ]] || die "--install-dir 后需要目录"
        INSTALL_DIR="$2"
        INSTALL_DIR_EXPLICIT=1
        shift 2
        ;;
      --backup-dir)
        [[ $# -ge 2 ]] || die "--backup-dir 后需要目录"
        BACKUP_MODE="yes"
        BACKUP_DIR="$2"
        shift 2
        ;;
      --no-backup)
        BACKUP_MODE="no"
        shift
        ;;
      --remove-images)
        IMAGE_MODE="yes"
        shift
        ;;
      --keep-images)
        IMAGE_MODE="no"
        shift
        ;;
      --remove-source)
        SOURCE_MODE="yes"
        shift
        ;;
      --keep-source)
        SOURCE_MODE="no"
        shift
        ;;
      --source-dir)
        [[ $# -ge 2 ]] || die "--source-dir 后需要目录"
        SOURCE_DIR="$2"
        shift 2
        ;;
      --yes)
        ASSUME_YES=1
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

validate_removal_dir() {
  local path="$1" label="$2"

  [[ "$path" == /* ]] || die "$label 必须是绝对路径：$path"
  case "$path" in
    /|/bin|/boot|/data|/dev|/etc|/home|/lib|/lib64|/opt|/proc|/root|/run|/sbin|/srv|/sys|/tmp|/usr|/var)
      die "拒绝把系统目录作为$label：$path"
      ;;
  esac
  [[ "$path" == /*/* ]] || die "$label 路径层级过浅：$path"
}

resolve_paths() {
  [[ -d "$INSTALL_DIR" ]] || die "安装目录不存在：$INSTALL_DIR"
  INSTALL_REAL="$(cd "$INSTALL_DIR" && pwd -P)"
  validate_removal_dir "$INSTALL_REAL" "安装目录"
  [[ -f "$INSTALL_REAL/docker-compose.yml" ]] || \
    die "安装目录中缺少 docker-compose.yml：$INSTALL_REAL"

  if [[ -d "$SOURCE_DIR" ]]; then
    SOURCE_REAL="$(cd "$SOURCE_DIR" && pwd -P)"
    validate_removal_dir "$SOURCE_REAL" "源码目录"
  else
    SOURCE_REAL="$SOURCE_DIR"
  fi

  COMPOSE_FILES=(-f docker-compose.yml)
  if [[ -f "$INSTALL_REAL/compose.custom.yml" ]]; then
    COMPOSE_FILES+=(-f compose.custom.yml)
  fi
}

compose() {
  (
    cd "$INSTALL_REAL"
    docker compose "${COMPOSE_FILES[@]}" "$@"
  )
}

add_image() {
  local candidate="$1" existing
  [[ -n "$candidate" ]] || return 0
  for existing in "${IMAGES[@]:-}"; do
    [[ "$existing" == "$candidate" ]] && return 0
  done
  IMAGES+=("$candidate")
}

collect_images() {
  local image output

  if ! output="$(compose config --images)"; then
    die "无法解析 Compose 配置，未执行卸载"
  fi
  while IFS= read -r image; do
    add_image "$image"
  done <<< "$output"
}

ask_yes_no() {
  local prompt="$1" default="$2" reply

  if [[ ! -r /dev/tty ]]; then
    die "当前没有交互式终端，请使用明确选项并添加 --yes"
  fi

  if [[ "$default" == "yes" ]]; then
    printf '%s [Y/n] ' "$prompt" >/dev/tty
  else
    printf '%s [y/N] ' "$prompt" >/dev/tty
  fi
  IFS= read -r reply </dev/tty

  case "$reply" in
    y|Y|yes|YES|Yes) return 0 ;;
    n|N|no|NO|No) return 1 ;;
    '') [[ "$default" == "yes" ]] ;;
    *) warn "无法识别输入，按“否”处理"; return 1 ;;
  esac
}

choose_actions() {
  if [[ "$ASSUME_YES" -eq 1 ]]; then
    [[ "$INSTALL_DIR_EXPLICIT" -eq 1 ]] || \
      die "使用 --yes 时必须通过 --install-dir 明确指定安装目录"
    [[ "$BACKUP_MODE" != "prompt" ]] || \
      die "使用 --yes 时必须指定 --backup-dir 或 --no-backup"
    [[ "$IMAGE_MODE" != "prompt" ]] || \
      die "使用 --yes 时必须指定 --remove-images 或 --keep-images"
    [[ "$SOURCE_MODE" != "prompt" ]] || \
      die "使用 --yes 时必须指定 --remove-source 或 --keep-source"
    return 0
  fi

  if [[ "$BACKUP_MODE" == "prompt" ]]; then
    if ask_yes_no "卸载前是否备份安装目录？" yes; then
      BACKUP_MODE="yes"
      BACKUP_DIR="$(dirname "$INSTALL_REAL")/pandawiki-backups"
    else
      BACKUP_MODE="no"
    fi
  fi

  if [[ "$IMAGE_MODE" == "prompt" ]]; then
    if ask_yes_no "是否删除上面列出的项目镜像？" yes; then
      IMAGE_MODE="yes"
    else
      IMAGE_MODE="no"
    fi
  fi

  if [[ "$SOURCE_MODE" == "prompt" ]]; then
    if ask_yes_no "是否同时删除源码目录 $SOURCE_REAL？" no; then
      SOURCE_MODE="yes"
    else
      SOURCE_MODE="no"
    fi
  fi

}

validate_source_removal() {
  if [[ "$SOURCE_MODE" != "yes" ]]; then
    case "$SOURCE_REAL/" in
      "$INSTALL_REAL/"*)
        die "源码目录位于安装目录内部，删除安装目录时无法保留源码：$SOURCE_REAL"
        ;;
    esac
    return 0
  fi

  [[ -d "$SOURCE_REAL" ]] || return 0
  [[ -f "$SOURCE_REAL/backend/go.mod" && -d "$SOURCE_REAL/web" && \
    -f "$SOURCE_REAL/scripts/uninstall.sh" ]] || \
    die "源码目录不像 PandaWiki 仓库，拒绝删除：$SOURCE_REAL"
}

prepare_backup_dir() {
  local backup_real

  [[ -n "$BACKUP_DIR" ]] || \
    BACKUP_DIR="$(dirname "$INSTALL_REAL")/pandawiki-backups"
  [[ "$BACKUP_DIR" == /* ]] || die "备份目录必须是绝对路径：$BACKUP_DIR"
  mkdir -p "$BACKUP_DIR"
  backup_real="$(cd "$BACKUP_DIR" && pwd -P)"
  case "$backup_real/" in
    "$INSTALL_REAL/"*) die "备份目录不能位于安装目录内部：$backup_real" ;;
  esac
  if [[ "$SOURCE_MODE" == "yes" ]]; then
    case "$backup_real/" in
      "$SOURCE_REAL/"*) die "备份目录不能位于待删除的源码目录内部：$backup_real" ;;
    esac
  fi
  BACKUP_DIR="$backup_real"
}

show_summary() {
  local image size source_note="保留"

  size="$(du -sh "$INSTALL_REAL" 2>/dev/null | awk '{print $1}' || true)"
  printf '\n即将卸载 PandaWiki：\n'
  printf '  安装目录：%s%s\n' "$INSTALL_REAL" "${size:+（约 $size）}"
  printf '  Compose 文件：%s\n' "${COMPOSE_FILES[*]}"
  printf '  容器和网络：删除\n'
  printf '  Compose 数据卷：删除\n'
  if [[ -d "$RUNTIME_DIR" ]]; then
    printf '  运行时目录：%s（删除）\n' "$RUNTIME_DIR"
  fi
  printf '  当前引用镜像：\n'
  if [[ "${#IMAGES[@]}" -eq 0 ]]; then
    printf '    （未发现）\n'
  else
    for image in "${IMAGES[@]}"; do
      printf '    %s\n' "$image"
    done
  fi

  printf '\n当前容器：\n'
  compose ps -a || true

  if [[ -d "$SOURCE_REAL/.git" ]]; then
    if [[ -n "$(git -C "$SOURCE_REAL" status --porcelain 2>/dev/null || true)" ]]; then
      source_note="存在未提交改动"
    fi
  elif [[ ! -d "$SOURCE_REAL" ]]; then
    source_note="目录不存在"
  fi
  printf '\n源码目录：%s（%s）\n\n' "$SOURCE_REAL" "$source_note"
}

confirm_removal() {
  local expected reply

  [[ "$ASSUME_YES" -eq 0 ]] || return 0
  expected="DELETE $INSTALL_REAL"
  printf '此操作会永久删除业务数据。请输入下面整行内容确认：\n  %s\n> ' \
    "$expected" >/dev/tty
  IFS= read -r reply </dev/tty
  [[ "$reply" == "$expected" ]] || die "确认内容不匹配，已取消卸载"
}

create_backup() {
  local archive

  prepare_backup_dir
  archive="$BACKUP_DIR/pandawiki-$(date +%Y%m%d%H%M%S).tar.gz"
  log "停止服务，以便创建一致备份"
  compose stop
  log "备份安装目录到：$archive"
  if tar -C "$INSTALL_REAL" -czf "$archive" .; then
    log "备份完成：$archive"
  else
    warn "备份失败，尝试重新启动服务"
    compose start || true
    die "未执行删除；请检查磁盘空间和目录权限"
  fi
}

remove_images() {
  local image

  for image in "${IMAGES[@]}"; do
    if docker image inspect "$image" >/dev/null 2>&1; then
      if docker image rm "$image"; then
        log "已删除镜像：$image"
      else
        warn "镜像未删除（可能仍被其他项目使用）：$image"
      fi
    fi
  done
}

remove_directory() {
  local path="$1" label="$2"

  validate_removal_dir "$path" "$label"
  [[ -d "$path" ]] || return 0
  log "删除$label：$path"
  rm -rf -- "$path"
  [[ ! -e "$path" ]] || die "$label 删除失败：$path"
}

main() {
  parse_args "$@"
  [[ "$EUID" -eq 0 ]] || die "请使用 sudo 或 root 权限运行"
  require_command docker
  require_command tar
  docker compose version >/dev/null 2>&1 || die "Docker Compose 不可用"

  detect_install_dir
  resolve_paths
  collect_images
  show_summary
  choose_actions
  validate_source_removal

  if [[ "$BACKUP_MODE" == "yes" ]]; then
    printf '  备份：%s\n' "${BACKUP_DIR:-自动选择安装目录的同级备份目录}"
  else
    printf '  备份：不备份\n'
  fi
  printf '  镜像：%s\n' "$([[ "$IMAGE_MODE" == "yes" ]] && printf '删除' || printf '保留')"
  printf '  源码：%s\n\n' "$([[ "$SOURCE_MODE" == "yes" ]] && printf '删除' || printf '保留')"
  confirm_removal

  if [[ "$BACKUP_MODE" == "yes" ]]; then
    create_backup
  fi

  log "停止并删除容器、网络和 Compose 数据卷"
  compose down --volumes --remove-orphans

  if [[ -d "$RUNTIME_DIR" ]]; then
    remove_directory "$RUNTIME_DIR" "运行时目录"
  fi

  if [[ "$IMAGE_MODE" == "yes" ]]; then
    remove_images
  fi

  remove_directory "$INSTALL_REAL" "安装目录"

  if [[ "$SOURCE_MODE" == "yes" && "$SOURCE_REAL" != "$INSTALL_REAL" ]]; then
    remove_directory "$SOURCE_REAL" "源码目录"
  fi

  log "PandaWiki 卸载完成"
  [[ "$BACKUP_MODE" == "yes" ]] && log "备份保留在：$BACKUP_DIR"
  warn "外部数据库、对象存储、反向代理、DNS 和防火墙规则需要按实际情况另行清理"
}

main "$@"
