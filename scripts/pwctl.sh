#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

INSTALL_DIR="${PW_INSTALL_DIR:-}"
IMAGE_NAMESPACE="pandawiki-local"
EDITION="community"
PLATFORM="${PW_PLATFORM:-}"
APP_TARGET="${PW_APP_TARGET:-http://panda-wiki-api:8000}"

API_TAG=""
CONSUMER_TAG=""
NGINX_TAG=""
APP_TAG=""
PREV_API_TAG=""
PREV_CONSUMER_TAG=""
PREV_NGINX_TAG=""
PREV_APP_TAG=""

STATE_FILE=""
OVERRIDE_FILE=""
TARGETS=()

log() {
  printf '[pwctl] %s\n' "$*"
}

warn() {
  printf '[pwctl] 警告：%s\n' "$*" >&2
}

die() {
  printf '[pwctl] 错误：%s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "缺少命令：$1"
}

usage() {
  cat <<'EOF'
PandaWiki 一键构建和部署工具

用法：
  ./scripts/pwctl.sh <命令> [服务范围] [选项]

常用命令：
  doctor                     检查 Git、Docker、Node.js、pnpm 和安装目录
  init                       为官方一键安装目录初始化自定义镜像配置
  build <范围> [--tag TAG]   只构建镜像，不更新容器
  update <范围> [--tag TAG]  构建镜像并立即更新对应容器
  deploy <范围> --tag TAG    使用已经存在的镜像更新对应容器
  rollback [范围]            回滚到这些服务的上一镜像版本
  up                         启动整套项目
  down                       停止整套项目，不删除数据卷
  restart [范围]             重启整套项目或指定业务服务
  status                     查看容器、镜像和当前/上一版本
  logs [范围]                持续查看日志，按 Ctrl+C 退出
  backup [目录]              停机打包备份整个安装目录
  images                     显示 Compose 最终使用的镜像

服务范围：
  all        API、Consumer、Admin、App
  backend    API、Consumer
  frontend   Admin、App
  api | consumer | admin | app
  api,admin  也可以使用逗号组合

最常用示例：
  ./scripts/pwctl.sh update all
  ./scripts/pwctl.sh update backend
  ./scripts/pwctl.sh update admin
  ./scripts/pwctl.sh logs api
  ./scripts/pwctl.sh rollback backend

可选环境变量：
  PW_INSTALL_DIR=/data/pandawiki
  PW_IMAGE_NAMESPACE=pandawiki-local
  PW_EDITION=community|pro
  PW_PLATFORM=linux/amd64
  PW_APP_TARGET=http://panda-wiki-api:8000
EOF
}

detect_install_dir() {
  local detected=""

  if [[ -n "$INSTALL_DIR" ]]; then
    :
  elif command -v docker >/dev/null 2>&1; then
    detected="$(docker inspect panda-wiki-api \
      --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}' \
      2>/dev/null || true)"
    if [[ -n "$detected" && "$detected" != "<no value>" ]]; then
      INSTALL_DIR="$detected"
    fi
  fi

  if [[ -z "$INSTALL_DIR" && -f /data/pandawiki/docker-compose.yml ]]; then
    INSTALL_DIR="/data/pandawiki"
  fi

  if [[ -n "$INSTALL_DIR" ]]; then
    STATE_FILE="$INSTALL_DIR/.pwctl-state"
    OVERRIDE_FILE="$INSTALL_DIR/compose.custom.yml"
  fi
}

require_install_dir() {
  detect_install_dir
  [[ -n "$INSTALL_DIR" ]] || die "未找到 PandaWiki 安装目录。请先运行 first-deploy.sh，或设置 PW_INSTALL_DIR。"
  [[ -d "$INSTALL_DIR" ]] || die "安装目录不存在：$INSTALL_DIR"
  [[ -f "$INSTALL_DIR/docker-compose.yml" ]] || die "缺少 $INSTALL_DIR/docker-compose.yml"
}

load_state() {
  local key value

  [[ -n "$STATE_FILE" && -f "$STATE_FILE" ]] || return 0

  while IFS='=' read -r key value; do
    case "$key" in
      IMAGE_NAMESPACE) IMAGE_NAMESPACE="$value" ;;
      EDITION) EDITION="$value" ;;
      API_TAG) API_TAG="$value" ;;
      CONSUMER_TAG) CONSUMER_TAG="$value" ;;
      NGINX_TAG) NGINX_TAG="$value" ;;
      APP_TAG) APP_TAG="$value" ;;
      PREV_API_TAG) PREV_API_TAG="$value" ;;
      PREV_CONSUMER_TAG) PREV_CONSUMER_TAG="$value" ;;
      PREV_NGINX_TAG) PREV_NGINX_TAG="$value" ;;
      PREV_APP_TAG) PREV_APP_TAG="$value" ;;
    esac
  done < "$STATE_FILE"
}

apply_environment_config() {
  if [[ -n "${PW_IMAGE_NAMESPACE:-}" ]]; then
    IMAGE_NAMESPACE="$PW_IMAGE_NAMESPACE"
  fi
  if [[ -n "${PW_EDITION:-}" ]]; then
    EDITION="$PW_EDITION"
  fi

  case "$EDITION" in
    community|pro) ;;
    *) die "PW_EDITION 只能是 community 或 pro" ;;
  esac
  [[ "$IMAGE_NAMESPACE" =~ ^[A-Za-z0-9._:/-]+$ ]] || \
    die "镜像命名空间包含非法字符：$IMAGE_NAMESPACE"
}

write_state() {
  local temporary

  umask 077
  temporary="$(mktemp "$INSTALL_DIR/.pwctl-state.XXXXXX")"
  {
    printf 'IMAGE_NAMESPACE=%s\n' "$IMAGE_NAMESPACE"
    printf 'EDITION=%s\n' "$EDITION"
    printf 'API_TAG=%s\n' "$API_TAG"
    printf 'CONSUMER_TAG=%s\n' "$CONSUMER_TAG"
    printf 'NGINX_TAG=%s\n' "$NGINX_TAG"
    printf 'APP_TAG=%s\n' "$APP_TAG"
    printf 'PREV_API_TAG=%s\n' "$PREV_API_TAG"
    printf 'PREV_CONSUMER_TAG=%s\n' "$PREV_CONSUMER_TAG"
    printf 'PREV_NGINX_TAG=%s\n' "$PREV_NGINX_TAG"
    printf 'PREV_APP_TAG=%s\n' "$PREV_APP_TAG"
  } > "$temporary"
  mv "$temporary" "$STATE_FILE"
}

render_override() {
  local temporary has_service=0

  umask 077
  temporary="$(mktemp "$INSTALL_DIR/.compose.custom.XXXXXX")"

  if [[ -z "$API_TAG$CONSUMER_TAG$NGINX_TAG$APP_TAG" ]]; then
    printf 'services: {}\n' > "$temporary"
  else
    printf 'services:\n' > "$temporary"

    if [[ -n "$API_TAG" ]]; then
      has_service=1
      printf '  api:\n    image: %s/api:%s\n    pull_policy: never\n' \
        "$IMAGE_NAMESPACE" "$API_TAG" >> "$temporary"
    fi
    if [[ -n "$CONSUMER_TAG" ]]; then
      has_service=1
      printf '  consumer:\n    image: %s/consumer:%s\n    pull_policy: never\n' \
        "$IMAGE_NAMESPACE" "$CONSUMER_TAG" >> "$temporary"
    fi
    if [[ -n "$NGINX_TAG" ]]; then
      has_service=1
      printf '  nginx:\n    image: %s/nginx:%s\n    pull_policy: never\n' \
        "$IMAGE_NAMESPACE" "$NGINX_TAG" >> "$temporary"
    fi
    if [[ -n "$APP_TAG" ]]; then
      has_service=1
      printf '  app:\n    image: %s/app:%s\n    pull_policy: never\n' \
        "$IMAGE_NAMESPACE" "$APP_TAG" >> "$temporary"
    fi

    [[ "$has_service" -eq 1 ]] || printf '  {}\n' >> "$temporary"
  fi

  mv "$temporary" "$OVERRIDE_FILE"
}

compose() {
  local files=(-f docker-compose.yml)
  if [[ -f "$OVERRIDE_FILE" ]]; then
    files+=(-f "$(basename "$OVERRIDE_FILE")")
  fi
  (
    cd "$INSTALL_DIR"
    docker compose "${files[@]}" "$@"
  )
}

add_target() {
  local candidate="$1" existing
  for existing in "${TARGETS[@]:-}"; do
    [[ "$existing" == "$candidate" ]] && return 0
  done
  TARGETS+=("$candidate")
}

expand_targets() {
  local selector="${1:-all}" item
  local requested=()
  TARGETS=()

  IFS=',' read -r -a requested <<< "$selector"
  for item in "${requested[@]}"; do
    case "$item" in
      all)
        add_target api
        add_target consumer
        add_target nginx
        add_target app
        ;;
      backend)
        add_target api
        add_target consumer
        ;;
      frontend)
        add_target nginx
        add_target app
        ;;
      api|consumer|nginx|app)
        add_target "$item"
        ;;
      admin)
        add_target nginx
        ;;
      *) die "未知服务范围：$item" ;;
    esac
  done
}

generate_tag() {
  local commit="nogit" dirty=""
  if git -C "$REPO_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    commit="$(git -C "$REPO_DIR" rev-parse --short HEAD)"
    if [[ -n "$(git -C "$REPO_DIR" status --porcelain)" ]]; then
      dirty="-dirty"
    fi
  fi
  printf 'dev-%s-%s%s\n' "$(date +%Y%m%d%H%M%S)" "$commit" "$dirty"
}

parse_tag_option() {
  local generate_if_missing="${1:-yes}"
  shift
  BUILD_TAG="${PW_TAG:-}"
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --tag)
        [[ $# -ge 2 ]] || die "--tag 后需要版本号"
        BUILD_TAG="$2"
        shift 2
        ;;
      *) die "未知选项：$1" ;;
    esac
  done
  if [[ -z "$BUILD_TAG" ]]; then
    if [[ "$generate_if_missing" == "yes" ]]; then
      BUILD_TAG="$(generate_tag)"
    else
      die "deploy 必须通过 --tag 或 PW_TAG 指定已经构建的镜像版本"
    fi
  fi
  [[ "$BUILD_TAG" =~ ^[A-Za-z0-9_.-]+$ ]] || die "镜像 Tag 包含非法字符：$BUILD_TAG"
}

docker_build() {
  local dockerfile="$1" image="$2" context="$3"
  shift 3
  local extra_args=("$@")

  if [[ -n "$PLATFORM" ]]; then
    docker buildx build \
      --platform "$PLATFORM" \
      --load \
      -f "$dockerfile" \
      -t "$image" \
      "${extra_args[@]}" \
      "$context"
  else
    docker build \
      -f "$dockerfile" \
      -t "$image" \
      "${extra_args[@]}" \
      "$context"
  fi
}

ensure_pro_source() {
  if [[ "$EDITION" == "pro" && ! -f "$REPO_DIR/backend/pro/go.mod" ]]; then
    die "专业版源码未初始化或无权限。请初始化 backend/pro 子模块，或设置 PW_EDITION=community。"
  fi
}

ensure_frontend_tools() {
  require_command node
  if ! command -v pnpm >/dev/null 2>&1; then
    require_command corepack
    log "安装项目指定的 pnpm 10.12.1"
    corepack enable
    corepack prepare pnpm@10.12.1 --activate
  fi
}

build_targets() {
  local tag="$1" target api_dockerfile consumer_dockerfile frontend_needed=0

  require_command docker
  [[ -f "$REPO_DIR/backend/Dockerfile.api" ]] || die "脚本必须在 PandaWiki 源码仓库中运行"
  ensure_pro_source

  api_dockerfile="$REPO_DIR/backend/Dockerfile.api"
  consumer_dockerfile="$REPO_DIR/backend/Dockerfile.consumer"
  if [[ "$EDITION" == "pro" ]]; then
    api_dockerfile="$REPO_DIR/backend/Dockerfile.api.pro"
    consumer_dockerfile="$REPO_DIR/backend/Dockerfile.consumer.pro"
  fi

  log "构建版本：$tag；版本类型：$EDITION"

  for target in "${TARGETS[@]}"; do
    if [[ "$target" == "nginx" || "$target" == "app" ]]; then
      frontend_needed=1
    fi
  done

  if [[ "$frontend_needed" -eq 1 ]]; then
    ensure_frontend_tools
    log "安装/校验前端依赖"
    (cd "$REPO_DIR/web" && pnpm install --frozen-lockfile)
  fi

  for target in "${TARGETS[@]}"; do
    case "$target" in
      api)
        log "构建 API 镜像"
        docker_build "$api_dockerfile" \
          "$IMAGE_NAMESPACE/api:$tag" \
          "$REPO_DIR/backend" \
          --build-arg "VERSION=$tag"
        ;;
      consumer)
        log "构建 Consumer 镜像"
        docker_build "$consumer_dockerfile" \
          "$IMAGE_NAMESPACE/consumer:$tag" \
          "$REPO_DIR/backend"
        ;;
      nginx)
        log "构建 Admin 静态资源"
        (cd "$REPO_DIR/web" && \
          VITE_APP_VERSION="$tag" pnpm --filter panda-wiki-admin build)
        log "构建 Admin Nginx 镜像"
        docker_build "$REPO_DIR/web/admin/Dockerfile" \
          "$IMAGE_NAMESPACE/nginx:$tag" \
          "$REPO_DIR/web/admin"
        ;;
      app)
        log "构建 App standalone 产物"
        (cd "$REPO_DIR/web" && \
          TARGET="$APP_TARGET" pnpm --filter panda-wiki-app build)
        log "构建 App Node 镜像"
        docker_build "$REPO_DIR/web/app/Dockerfile" \
          "$IMAGE_NAMESPACE/app:$tag" \
          "$REPO_DIR/web/app"
        ;;
    esac
  done

  log "镜像构建完成：$tag"
}

image_for_target() {
  case "$1" in
    api) printf '%s/api:%s\n' "$IMAGE_NAMESPACE" "$2" ;;
    consumer) printf '%s/consumer:%s\n' "$IMAGE_NAMESPACE" "$2" ;;
    nginx) printf '%s/nginx:%s\n' "$IMAGE_NAMESPACE" "$2" ;;
    app) printf '%s/app:%s\n' "$IMAGE_NAMESPACE" "$2" ;;
  esac
}

require_images() {
  local tag="$1" target image
  for target in "${TARGETS[@]}"; do
    image="$(image_for_target "$target" "$tag")"
    docker image inspect "$image" >/dev/null 2>&1 || die "本机不存在镜像：$image"
  done
}

set_deployed_tag() {
  local target="$1" tag="$2"
  case "$target" in
    api)
      [[ "$API_TAG" == "$tag" ]] || PREV_API_TAG="$API_TAG"
      API_TAG="$tag"
      ;;
    consumer)
      [[ "$CONSUMER_TAG" == "$tag" ]] || PREV_CONSUMER_TAG="$CONSUMER_TAG"
      CONSUMER_TAG="$tag"
      ;;
    nginx)
      [[ "$NGINX_TAG" == "$tag" ]] || PREV_NGINX_TAG="$NGINX_TAG"
      NGINX_TAG="$tag"
      ;;
    app)
      [[ "$APP_TAG" == "$tag" ]] || PREV_APP_TAG="$APP_TAG"
      APP_TAG="$tag"
      ;;
  esac
}

deploy_targets() {
  local tag="$1" target
  local old_api="$API_TAG" old_consumer="$CONSUMER_TAG"
  local old_nginx="$NGINX_TAG" old_app="$APP_TAG"
  local old_prev_api="$PREV_API_TAG" old_prev_consumer="$PREV_CONSUMER_TAG"
  local old_prev_nginx="$PREV_NGINX_TAG" old_prev_app="$PREV_APP_TAG"

  require_images "$tag"

  for target in "${TARGETS[@]}"; do
    set_deployed_tag "$target" "$tag"
  done
  write_state
  render_override

  log "更新容器：${TARGETS[*]}"
  if ! compose up -d --no-deps --pull never "${TARGETS[@]}"; then
    warn "Compose 更新失败，恢复部署配置"
    API_TAG="$old_api"
    CONSUMER_TAG="$old_consumer"
    NGINX_TAG="$old_nginx"
    APP_TAG="$old_app"
    PREV_API_TAG="$old_prev_api"
    PREV_CONSUMER_TAG="$old_prev_consumer"
    PREV_NGINX_TAG="$old_prev_nginx"
    PREV_APP_TAG="$old_prev_app"
    write_state
    render_override
    die "容器更新失败，请查看 Docker 输出"
  fi

  compose ps "${TARGETS[@]}"
  if [[ " ${TARGETS[*]} " == *" api "* ]]; then
    log "API 镜像包含数据库迁移，请确认下面日志中迁移和启动成功"
    compose logs --tail=80 api
  fi
  log "更新完成。建议运行：./scripts/pwctl.sh status"
}

show_state() {
  printf '\n%-10s %-32s %-32s\n' '服务' '当前 Tag' '上一 Tag'
  printf '%-10s %-32s %-32s\n' 'api' "${API_TAG:--}" "${PREV_API_TAG:--}"
  printf '%-10s %-32s %-32s\n' 'consumer' "${CONSUMER_TAG:--}" "${PREV_CONSUMER_TAG:--}"
  printf '%-10s %-32s %-32s\n' 'admin' "${NGINX_TAG:--}" "${PREV_NGINX_TAG:--}"
  printf '%-10s %-32s %-32s\n' 'app' "${APP_TAG:--}" "${PREV_APP_TAG:--}"
}

rollback_targets() {
  local target previous current

  for target in "${TARGETS[@]}"; do
    case "$target" in
      api) previous="$PREV_API_TAG" ;;
      consumer) previous="$PREV_CONSUMER_TAG" ;;
      nginx) previous="$PREV_NGINX_TAG" ;;
      app) previous="$PREV_APP_TAG" ;;
    esac
    [[ -n "$previous" ]] || die "$target 没有可回滚的上一版本"
    docker image inspect "$(image_for_target "$target" "$previous")" >/dev/null 2>&1 || \
      die "$target 的上一版本镜像已不存在：$previous"
  done

  for target in "${TARGETS[@]}"; do
    case "$target" in
      api)
        current="$API_TAG"; API_TAG="$PREV_API_TAG"; PREV_API_TAG="$current"
        ;;
      consumer)
        current="$CONSUMER_TAG"; CONSUMER_TAG="$PREV_CONSUMER_TAG"; PREV_CONSUMER_TAG="$current"
        ;;
      nginx)
        current="$NGINX_TAG"; NGINX_TAG="$PREV_NGINX_TAG"; PREV_NGINX_TAG="$current"
        ;;
      app)
        current="$APP_TAG"; APP_TAG="$PREV_APP_TAG"; PREV_APP_TAG="$current"
        ;;
    esac
  done

  write_state
  render_override
  compose up -d --no-deps --pull never "${TARGETS[@]}"
  compose ps "${TARGETS[@]}"
  warn "镜像已回滚；数据库结构不会自动回滚。涉及迁移时请核对数据库兼容性。"
}

backup_installation() {
  local backup_dir="${1:-${PW_BACKUP_DIR:-$(dirname "$INSTALL_DIR")/pandawiki-backups}}"
  local archive backup_real install_real

  mkdir -p "$backup_dir"
  backup_real="$(cd "$backup_dir" && pwd -P)"
  install_real="$(cd "$INSTALL_DIR" && pwd -P)"
  case "$backup_real/" in
    "$install_real/"*) die "备份目录不能位于 PandaWiki 安装目录内部" ;;
  esac
  archive="$backup_dir/pandawiki-$(date +%Y%m%d%H%M%S).tar.gz"
  log "停止服务并备份到：$archive"
  compose down
  if tar -C "$INSTALL_DIR" -czf "$archive" .; then
    compose up -d --pull never
    log "备份完成：$archive"
  else
    warn "备份失败，尝试重新启动服务"
    compose up -d --pull never
    return 1
  fi
}

doctor() {
  local failed=0 command_name version

  for command_name in git docker node pnpm; do
    if command -v "$command_name" >/dev/null 2>&1; then
      version="$($command_name --version 2>/dev/null | head -n 1 || true)"
      printf '[OK]   %-8s %s\n' "$command_name" "$version"
    else
      printf '[缺少] %-8s\n' "$command_name"
      failed=1
    fi
  done

  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    printf '[OK]   %-8s %s\n' 'compose' "$(docker compose version)"
  else
    printf '[缺少] %-8s\n' 'compose'
    failed=1
  fi

  detect_install_dir
  if [[ -n "$INSTALL_DIR" && -f "$INSTALL_DIR/docker-compose.yml" ]]; then
    printf '[OK]   安装目录 %s\n' "$INSTALL_DIR"
  else
    printf '[未发现] PandaWiki 官方安装目录\n'
  fi

  if [[ "$failed" -ne 0 ]]; then
    return 1
  fi
}

main() {
  local command="${1:-help}" selector
  [[ $# -eq 0 ]] || shift

  case "$command" in
    help|-h|--help)
      usage
      ;;
    doctor)
      doctor
      ;;
    init)
      require_command docker
      require_install_dir
      load_state
      apply_environment_config
      write_state
      render_override
      log "初始化完成：$OVERRIDE_FILE"
      compose config --images
      ;;
    build)
      selector="${1:-all}"
      [[ $# -eq 0 ]] || shift
      detect_install_dir
      load_state
      apply_environment_config
      expand_targets "$selector"
      parse_tag_option yes "$@"
      build_targets "$BUILD_TAG"
      ;;
    update)
      selector="${1:-all}"
      [[ $# -eq 0 ]] || shift
      require_install_dir
      load_state
      apply_environment_config
      expand_targets "$selector"
      parse_tag_option yes "$@"
      if [[ " ${TARGETS[*]} " == *" api "* ]]; then
        warn "API 更新可能执行数据库迁移；重要环境请先运行 pwctl.sh backup。"
      fi
      build_targets "$BUILD_TAG"
      deploy_targets "$BUILD_TAG"
      ;;
    deploy)
      selector="${1:-all}"
      [[ $# -eq 0 ]] || shift
      require_install_dir
      load_state
      apply_environment_config
      expand_targets "$selector"
      parse_tag_option no "$@"
      deploy_targets "$BUILD_TAG"
      ;;
    rollback)
      selector="${1:-all}"
      require_command docker
      require_install_dir
      load_state
      apply_environment_config
      expand_targets "$selector"
      rollback_targets
      ;;
    up)
      require_command docker
      require_install_dir
      load_state
      apply_environment_config
      render_override
      compose up -d --pull never
      compose ps
      ;;
    down)
      require_command docker
      require_install_dir
      load_state
      compose down
      ;;
    restart)
      require_command docker
      require_install_dir
      load_state
      if [[ $# -gt 0 ]]; then
        expand_targets "$1"
        compose restart "${TARGETS[@]}"
      else
        compose restart
      fi
      ;;
    status)
      require_command docker
      require_install_dir
      load_state
      apply_environment_config
      compose ps
      show_state
      ;;
    logs)
      require_command docker
      require_install_dir
      load_state
      if [[ $# -gt 0 ]]; then
        expand_targets "$1"
        compose logs -f --tail=200 "${TARGETS[@]}"
      else
        compose logs -f --tail=200 api consumer nginx app
      fi
      ;;
    backup)
      require_command docker
      require_command tar
      require_install_dir
      load_state
      backup_installation "${1:-}"
      ;;
    images)
      require_command docker
      require_install_dir
      load_state
      compose config --images
      ;;
    *)
      usage >&2
      die "未知命令：$command"
      ;;
  esac
}

main "$@"
