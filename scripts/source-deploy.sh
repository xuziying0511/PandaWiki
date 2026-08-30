#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

REPO_URL="${PW_REPO_URL:-https://github.com/xzwork/PandaWiki.git}"
SOURCE_DIR="${PW_SOURCE_DIR:-}"
BRANCH="${PW_GIT_BRANCH:-main}"
SERVICES="all"
INSTALL_DIR_OPTION="${PW_INSTALL_DIR:-}"
BUILD_TAG=""
PULL_SOURCE=1

log() {
  printf '[source-deploy] %s\n' "$*"
}

die() {
  printf '[source-deploy] 错误：%s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
拉取 PandaWiki 源码，然后一键构建镜像并更新容器。

用法：
  ./scripts/source-deploy.sh [选项]

选项：
  --repo URL          Git 仓库地址
  --dir DIR           源码目录
  --branch BRANCH     拉取分支，默认 main
  --services RANGE    更新范围，默认 all
  --install-dir DIR   PandaWiki 官方安装目录
  --tag TAG           指定镜像版本号
  --no-pull           不拉取代码，直接构建当前源码
  -h, --help          显示帮助

示例：
  ./scripts/source-deploy.sh --services all
  ./scripts/source-deploy.sh --services backend
  ./scripts/source-deploy.sh --services admin --no-pull
  ./scripts/source-deploy.sh --dir /opt/pandawiki-src --branch main
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --repo)
        [[ $# -ge 2 ]] || die "--repo 后需要地址"
        REPO_URL="$2"
        shift 2
        ;;
      --dir)
        [[ $# -ge 2 ]] || die "--dir 后需要目录"
        SOURCE_DIR="$2"
        shift 2
        ;;
      --branch)
        [[ $# -ge 2 ]] || die "--branch 后需要分支名"
        BRANCH="$2"
        shift 2
        ;;
      --services)
        [[ $# -ge 2 ]] || die "--services 后需要服务范围"
        SERVICES="$2"
        shift 2
        ;;
      --install-dir)
        [[ $# -ge 2 ]] || die "--install-dir 后需要目录"
        INSTALL_DIR_OPTION="$2"
        shift 2
        ;;
      --tag)
        [[ $# -ge 2 ]] || die "--tag 后需要版本号"
        BUILD_TAG="$2"
        shift 2
        ;;
      --no-pull)
        PULL_SOURCE=0
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

choose_source_dir() {
  if [[ -n "$SOURCE_DIR" ]]; then
    return 0
  fi

  if git -C "$SCRIPT_REPO_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    SOURCE_DIR="$SCRIPT_REPO_DIR"
  else
    SOURCE_DIR="/opt/pandawiki-src"
  fi
}

clone_or_update_source() {
  local current_branch parent_dir

  if [[ ! -d "$SOURCE_DIR/.git" ]]; then
    [[ ! -e "$SOURCE_DIR" || -d "$SOURCE_DIR" ]] || die "源码目标不是目录：$SOURCE_DIR"
    parent_dir="$(dirname "$SOURCE_DIR")"
    mkdir -p "$parent_dir"
    log "克隆 $REPO_URL 的 $BRANCH 分支到 $SOURCE_DIR"
    git clone --branch "$BRANCH" --single-branch "$REPO_URL" "$SOURCE_DIR"
    return 0
  fi

  if [[ "$PULL_SOURCE" -eq 0 ]]; then
    log "跳过源码拉取，直接使用 $SOURCE_DIR"
    return 0
  fi

  [[ -z "$(git -C "$SOURCE_DIR" status --porcelain)" ]] || \
    die "源码目录存在未提交改动。请提交/保存改动，或使用 --no-pull 直接构建。"

  current_branch="$(git -C "$SOURCE_DIR" branch --show-current)"
  [[ "$current_branch" == "$BRANCH" ]] || \
    die "当前分支是 $current_branch，不是 $BRANCH。请切换分支或修改 --branch。"

  log "以 fast-forward 方式拉取 $BRANCH"
  git -C "$SOURCE_DIR" pull --ff-only origin "$BRANCH"
}

main() {
  local update_args

  parse_args "$@"
  update_args=(update "$SERVICES")
  command -v git >/dev/null 2>&1 || die "缺少 Git"
  choose_source_dir
  clone_or_update_source

  [[ -x "$SOURCE_DIR/scripts/pwctl.sh" ]] || \
    die "源码中缺少可执行脚本：$SOURCE_DIR/scripts/pwctl.sh"

  if [[ -n "$INSTALL_DIR_OPTION" ]]; then
    export PW_INSTALL_DIR="$INSTALL_DIR_OPTION"
  fi
  if [[ -n "$BUILD_TAG" ]]; then
    update_args+=(--tag "$BUILD_TAG")
  fi

  log "开始构建并更新：$SERVICES"
  exec "$SOURCE_DIR/scripts/pwctl.sh" "${update_args[@]}"
}

main "$@"
