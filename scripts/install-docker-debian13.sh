#!/usr/bin/env bash

set -Eeuo pipefail

DOCKER_APT_MIRROR="${DOCKER_APT_MIRROR:-https://mirrors.aliyun.com/docker-ce/linux/debian}"
DOCKER_APT_MIRROR="${DOCKER_APT_MIRROR%/}"
DOCKER_KEY_URL="${DOCKER_KEY_URL:-https://download.docker.com/linux/debian/gpg}"
DOCKER_SOURCE_FILE="/etc/apt/sources.list.d/docker.sources"
DOCKER_KEY_FILE="/etc/apt/keyrings/docker.asc"
BACKUP_SUFFIX="$(date +%Y%m%d%H%M%S).$$.bak"

log() {
  printf '[docker-install] %s\n' "$*"
}

warn() {
  printf '[docker-install] 警告：%s\n' "$*" >&2
}

die() {
  printf '[docker-install] 错误：%s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
为 Debian 13 (trixie) 配置 Docker CE 软件源并安装 Docker。

用法：
  sudo ./scripts/install-docker-debian13.sh

可选环境变量：
  DOCKER_APT_MIRROR=https://mirrors.aliyun.com/docker-ce/linux/debian
  DOCKER_KEY_URL=https://download.docker.com/linux/debian/gpg

说明：
  - 会备份并禁用已有的 Docker Debian APT 源。
  - 不会删除 /var/lib/docker 中的镜像、容器或数据卷。
  - 已正常安装 Docker 和 Compose 时直接退出。
EOF
}

require_root() {
  [[ "$EUID" -eq 0 ]] || die "请使用 sudo 运行此脚本"
}

check_system() {
  [[ "$(uname -s)" == "Linux" ]] || die "此脚本只支持 Linux"
  [[ -r /etc/os-release ]] || die "无法读取 /etc/os-release"

  # shellcheck disable=SC1091
  source /etc/os-release
  [[ "${ID:-}" == "debian" ]] || die "当前系统不是 Debian：${PRETTY_NAME:-unknown}"
  [[ "${VERSION_ID:-}" == "13" || "${VERSION_CODENAME:-}" == "trixie" ]] || \
    die "此脚本只支持 Debian 13 (trixie)：${PRETTY_NAME:-unknown}"

  case "$DOCKER_APT_MIRROR" in
    http://*|https://*) ;;
    *) die "DOCKER_APT_MIRROR 必须是 HTTP(S) 地址" ;;
  esac

  log "系统：${PRETTY_NAME:-Debian 13}"
  log "Docker CE 软件源：$DOCKER_APT_MIRROR"
}

docker_is_ready() {
  command -v docker >/dev/null 2>&1 && \
    docker info >/dev/null 2>&1 && \
    docker compose version >/dev/null 2>&1
}

backup_file() {
  local source="$1" backup="${1}.${BACKUP_SUFFIX}"
  cp -a -- "$source" "$backup"
  log "已备份：$backup"
}

is_docker_debian_source() {
  grep -Eq \
    'download\.docker\.com/+linux/debian|mirrors\.[^[:space:]]+/+docker-ce/+linux/debian' \
    "$1"
}

disable_old_docker_sources() {
  local source temporary
  local list_files=(/etc/apt/sources.list /etc/apt/sources.list.d/*.list)
  local deb822_files=(/etc/apt/sources.list.d/*.sources)

  shopt -s nullglob

  # .list 文件按行注释 Docker Debian 源，保留其他软件源。
  for source in "${list_files[@]}"; do
    [[ -f "$source" ]] || continue
    if is_docker_debian_source "$source"; then
      backup_file "$source"
      sed -Ei \
        '/download\.docker\.com\/+linux\/debian|mirrors\.[^[:space:]]+\/+docker-ce\/+linux\/debian/s/^[[:space:]]*([^#])/# disabled by PandaWiki Docker installer: \1/' \
        "$source"
      log "已禁用旧 Docker 源：$source"
    fi
  done

  # deb822 文件以空行分隔 stanza，只移除 Docker Debian stanza。
  for source in "${deb822_files[@]}"; do
    [[ -f "$source" ]] || continue
    if is_docker_debian_source "$source"; then
      backup_file "$source"
      temporary="$(mktemp /tmp/docker-sources.XXXXXX)"
      awk -v RS='' -v ORS='\n\n' \
        '!/download\.docker\.com\/+linux\/debian/ && !/mirrors\.[^[:space:]]+\/+docker-ce\/+linux\/debian/' \
        "$source" > "$temporary"
      install -m 0644 "$temporary" "$source"
      rm -f -- "$temporary"
      log "已禁用旧 Docker 源：$source"
    fi
  done

  shopt -u nullglob
}

install_prerequisites() {
  log "更新 APT 索引并安装基础工具"
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
}

install_docker_key() {
  log "下载 Docker 官方 GPG 密钥"
  if ! curl -fsSL "$DOCKER_KEY_URL" -o "$DOCKER_KEY_FILE"; then
    warn "官方密钥地址下载失败，尝试从当前镜像源下载"
    curl -fsSL "$DOCKER_APT_MIRROR/gpg" -o "$DOCKER_KEY_FILE"
  fi
  [[ -s "$DOCKER_KEY_FILE" ]] || die "Docker GPG 密钥下载为空"
  chmod a+r "$DOCKER_KEY_FILE"
}

write_docker_source() {
  local architecture
  architecture="$(dpkg --print-architecture)"

  cat > "$DOCKER_SOURCE_FILE" <<EOF
Types: deb
URIs: $DOCKER_APT_MIRROR
Suites: trixie
Components: stable
Architectures: $architecture
Signed-By: $DOCKER_KEY_FILE
EOF

  chmod 0644 "$DOCKER_SOURCE_FILE"
  log "已写入 Debian 13 Docker 源：$DOCKER_SOURCE_FILE"
}

remove_conflicting_packages() {
  local package status
  local candidates=(
    docker.io
    docker-compose
    docker-doc
    docker-buildx
    podman-docker
    containerd
    runc
  )
  local installed=()

  for package in "${candidates[@]}"; do
    status="$(dpkg-query -W -f='${db:Status-Abbrev}' "$package" 2>/dev/null || true)"
    if [[ "$status" == "ii " ]]; then
      installed+=("$package")
    fi
  done

  if [[ "${#installed[@]}" -gt 0 ]]; then
    log "移除与 Docker CE 冲突的软件包：${installed[*]}"
    DEBIAN_FRONTEND=noninteractive apt-get remove -y "${installed[@]}"
  fi
}

install_docker() {
  log "更新 Docker CE 软件源"
  apt-get update
  remove_conflicting_packages

  log "安装 Docker Engine、Buildx 和 Compose"
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    docker-ce \
    docker-ce-cli \
    containerd.io \
    docker-buildx-plugin \
    docker-compose-plugin

  systemctl enable --now docker
}

configure_user() {
  if [[ -n "${SUDO_USER:-}" && "$SUDO_USER" != "root" ]]; then
    usermod -aG docker "$SUDO_USER"
    log "已将 $SUDO_USER 加入 docker 用户组，重新登录后生效"
  fi
}

verify_installation() {
  command -v docker >/dev/null 2>&1 || die "安装后未找到 docker 命令"
  docker info >/dev/null 2>&1 || die "Docker 服务未正常运行"
  docker compose version >/dev/null 2>&1 || die "Docker Compose 插件不可用"

  printf '\n'
  docker --version
  docker compose version
  printf '\nDocker 安装完成。\n'
  printf '现在可以继续执行：sudo ./scripts/first-deploy.sh\n'
}

main() {
  if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    usage
    exit 0
  fi
  [[ "$#" -eq 0 ]] || die "不支持的参数：$*"

  require_root
  check_system

  if docker_is_ready; then
    log "Docker 和 Docker Compose 已正常运行，无需重复安装"
    docker --version
    docker compose version
    exit 0
  fi

  disable_old_docker_sources
  install_prerequisites
  install_docker_key
  write_docker_source
  install_docker
  configure_user
  verify_installation
}

main "$@"
