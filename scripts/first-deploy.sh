#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANAGER_URL="${PW_MANAGER_URL:-https://release.baizhi.cloud/panda-wiki/manager.sh}"
TEMP_MANAGER=""

log() {
  printf '[first-deploy] %s\n' "$*"
}

die() {
  printf '[first-deploy] 错误：%s\n' "$*" >&2
  exit 1
}

cleanup() {
  if [[ -n "$TEMP_MANAGER" && -f "$TEMP_MANAGER" ]]; then
    rm -f -- "$TEMP_MANAGER"
  fi
}

usage() {
  cat <<'EOF'
首次部署 PandaWiki，并初始化二开镜像配置。

用法：
  sudo ./scripts/first-deploy.sh

说明：
  1. 如果还没有 panda-wiki-api 容器，脚本会下载并执行官方交互式安装器。
  2. 官方安装器仍会询问安装目录等信息，请按提示完成。
  3. 安装完成后自动调用 pwctl.sh init，不修改官方 docker-compose.yml。
  4. 如果官方环境已经存在，脚本只执行初始化，不会重复安装。

可选环境变量：
  PW_INSTALL_DIR=/data/pandawiki
  PW_MANAGER_URL=https://release.baizhi.cloud/panda-wiki/manager.sh
  PW_EDITION=community|pro
EOF
}

main() {
  if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    usage
    exit 0
  fi
  [[ $# -eq 0 ]] || die "不支持的参数：$*"
  [[ "$(uname -s)" == "Linux" ]] || die "官方首次安装器只支持 Linux"

  if ! command -v docker >/dev/null 2>&1 || \
    ! docker inspect panda-wiki-api >/dev/null 2>&1; then
    [[ "$EUID" -eq 0 ]] || die "首次安装可能安装 Docker，请使用 sudo 运行"
    command -v curl >/dev/null 2>&1 || die "缺少 curl"
    TEMP_MANAGER="$(mktemp /tmp/pandawiki-manager.XXXXXX)"
    trap cleanup EXIT

    log "下载官方安装入口：$MANAGER_URL"
    curl -fsSL "$MANAGER_URL" -o "$TEMP_MANAGER"
    [[ -s "$TEMP_MANAGER" ]] || die "官方安装入口下载为空"

    log "开始执行官方交互式安装器"
    bash "$TEMP_MANAGER"
  else
    log "检测到现有 panda-wiki-api 容器，跳过官方安装"
  fi

  command -v docker >/dev/null 2>&1 || die "官方安装结束后仍未找到 Docker"
  docker compose version >/dev/null 2>&1 || die "官方安装结束后仍未找到 Docker Compose"

  log "初始化二开 Compose Override"
  "$SCRIPT_DIR/pwctl.sh" init
  "$SCRIPT_DIR/pwctl.sh" status

  cat <<'EOF'

首次部署完成。

下一步如果要让源码版本替换官方业务镜像：
  ./scripts/pwctl.sh update all

以后只更新某个部分：
  ./scripts/pwctl.sh update backend
  ./scripts/pwctl.sh update admin
  ./scripts/pwctl.sh update app
EOF
}

main "$@"
