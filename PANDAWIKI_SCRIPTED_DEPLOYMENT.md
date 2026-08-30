# PandaWiki 一键脚本部署与二开更新

这份文档是二开部署的简化入口。日常不需要手工执行 Docker Build 和 Compose Override 命令，记住下面三个脚本即可。

## 1. 脚本分工

| 脚本                         | 用途                                                     | 常用时机              |
| ---------------------------- | -------------------------------------------------------- | --------------------- |
| `scripts/first-deploy.sh`  | 调用官方安装器部署中间件和官方业务服务，再初始化二开配置 | 新服务器第一次部署    |
| `scripts/source-deploy.sh` | 拉取最新源码，然后构建镜像并更新指定服务                 | 从 Git 获取代码并发布 |
| `scripts/pwctl.sh`         | 构建、更新、启停、日志、状态、备份和回滚                 | 日常二开              |

最终仍然是全 Docker 架构：PostgreSQL、Redis、NATS、MinIO、Qdrant、RAGLite、AnyDoc 和 Caddy 沿用官方镜像，只重建 PandaWiki 的四个业务镜像。

## 2. 新服务器第一次部署

先把源码放到服务器：

```bash
git clone https://github.com/xzwork/PandaWiki.git
cd PandaWiki
```

执行首次部署：

```bash
sudo ./scripts/first-deploy.sh
```

这个脚本会：

1. 检查是否已有 `panda-wiki-api` 容器。
2. 如果没有，下载并执行官方交互式安装器。
3. 由官方安装器检查或安装 Docker、下载 Compose、生成密码并启动全部服务。
4. 自动识别实际安装目录。
5. 创建独立的 `compose.custom.yml` 和 `.pwctl-state`。
6. 不修改官方 `docker-compose.yml`。

官方安装器仍会要求选择安装目录。使用默认值时通常为：

```text
/data/pandawiki
```

首次部署结束后运行的是官方业务镜像。要替换为当前源码构建的镜像，再执行：

```bash
sudo ./scripts/pwctl.sh update all
```

## 3. 日常最常用命令

### 修改后端

```bash
sudo ./scripts/pwctl.sh update backend
```

自动构建并更新：

- Go API。
- Go Consumer。

API 镜像启动时会先执行数据库迁移。重要环境建议先备份：

```bash
sudo ./scripts/pwctl.sh backup
sudo ./scripts/pwctl.sh update backend
```

### 只修改 Admin 管理端

```bash
sudo ./scripts/pwctl.sh update admin
```

脚本会自动安装/校验 pnpm 依赖、执行 TypeScript 和 Vite Build、构建 Nginx 镜像，然后只替换 `nginx` 容器。

### 只修改 App 用户端

```bash
sudo ./scripts/pwctl.sh update app
```

脚本会执行 Next.js standalone Build、构建 Node 镜像，然后只替换 `app` 容器。

### 更新全部业务服务

```bash
sudo ./scripts/pwctl.sh update all
```

### 自由组合

```bash
sudo ./scripts/pwctl.sh update api,admin
```

可用范围：

```text
all
backend
frontend
api
consumer
admin
app
api,admin 等逗号组合
```

## 4. 从 Git 拉取源码并一键发布

在已经克隆的仓库中执行：

```bash
sudo ./scripts/source-deploy.sh --services all
```

它会依次执行：

```text
检查工作区没有未提交改动
  → git pull --ff-only
  → 生成唯一镜像 Tag
  → 构建指定业务镜像
  → 更新 Compose Override
  → 定向替换容器
  → 输出容器状态和 API 日志
```

只拉取并发布后端：

```bash
sudo ./scripts/source-deploy.sh --services backend
```

只构建当前源码、不执行 Git Pull：

```bash
sudo ./scripts/source-deploy.sh --services admin --no-pull
```

指定源码目录和分支：

```bash
sudo ./scripts/source-deploy.sh \
  --dir /opt/pandawiki-src \
  --branch main \
  --services all
```

如果指定目录还没有仓库，脚本会先 Clone；如果已经存在，则只允许在工作区干净并且分支一致时执行 fast-forward Pull，不会强制覆盖本地改动。

## 5. 项目启停和查看日志

启动全部服务：

```bash
sudo ./scripts/pwctl.sh up
```

停止全部服务但保留数据：

```bash
sudo ./scripts/pwctl.sh down
```

重启全部服务：

```bash
sudo ./scripts/pwctl.sh restart
```

只重启 API：

```bash
sudo ./scripts/pwctl.sh restart api
```

查看状态和当前镜像版本：

```bash
sudo ./scripts/pwctl.sh status
```

查看业务服务日志：

```bash
sudo ./scripts/pwctl.sh logs
```

只查看某个服务：

```bash
sudo ./scripts/pwctl.sh logs api
```

按 `Ctrl+C` 退出持续日志，不会停止容器。

## 6. 构建和部署分开执行

只构建、不更新容器：

```bash
sudo ./scripts/pwctl.sh build backend
```

脚本会输出自动生成的 Tag。也可以指定版本：

```bash
sudo ./scripts/pwctl.sh build backend --tag dev-20260830-01
```

使用已经构建好的镜像部署：

```bash
sudo ./scripts/pwctl.sh deploy backend --tag dev-20260830-01
```

每个服务分别记录当前 Tag 和上一 Tag，因此只更新 Admin 不会影响后端和 App 的镜像版本。

## 7. 一键回滚

回滚后端：

```bash
sudo ./scripts/pwctl.sh rollback backend
```

只回滚 Admin：

```bash
sudo ./scripts/pwctl.sh rollback admin
```

回滚全部业务服务：

```bash
sudo ./scripts/pwctl.sh rollback all
```

回滚要求上一版本镜像仍保存在本机。脚本不会自动回滚数据库结构；如果新 API 已经执行了不兼容的数据库迁移，需要结合升级前备份处理。

## 8. 一键备份

```bash
sudo ./scripts/pwctl.sh backup
```

脚本会：

1. 停止整套 Compose 服务。
2. 打包整个 PandaWiki 安装目录。
3. 把备份保存到安装目录同级的 `pandawiki-backups/`。
4. 重新启动服务。

默认备份文件类似：

```text
/data/pandawiki-backups/pandawiki-20260830220000.tar.gz
```

这会产生短暂停机。数据量较大的生产环境仍建议额外使用 PostgreSQL `pg_dump` 和对象存储/磁盘快照。

## 9. 环境检查

```bash
./scripts/pwctl.sh doctor
```

它会检查：

- Git。
- Docker Engine。
- Docker Compose Plugin。
- Node.js。
- pnpm。
- PandaWiki 实际安装目录。

后端镜像在 Docker Builder 中编译，所以仅构建镜像时宿主机不要求安装 Go。需要运行 Go 测试、Lint 或 Wire/Swagger 生成时，仍需 Go 1.24.3。

## 10. 社区版与专业版

默认构建社区版：

```bash
sudo ./scripts/pwctl.sh update backend
```

有专业版子模块权限并已初始化 `backend/pro` 时：

```bash
sudo PW_EDITION=pro ./scripts/pwctl.sh init
sudo ./scripts/pwctl.sh update backend
```

版本类型会记录在安装目录的 `.pwctl-state` 中。没有专业版源码时脚本会直接停止，不会悄悄构建成社区版。

## 11. 非默认安装目录和跨架构构建

指定安装目录：

```bash
sudo PW_INSTALL_DIR=/srv/pandawiki ./scripts/pwctl.sh update all
```

在 ARM Mac 上为 amd64 Linux 服务器构建：

```bash
PW_PLATFORM=linux/amd64 ./scripts/pwctl.sh build all
```

前端 `dist` 仍在宿主机生成。为了避免 Node 原生依赖架构差异，正式镜像优先在目标 Linux 服务器或同架构 Linux 构建机完成。

## 12. 脚本的安全边界

- 不修改官方 `docker-compose.yml`，只维护 `compose.custom.yml`。
- `down` 不带 `-v`，不会主动删除数据卷。
- Git 更新只允许 `pull --ff-only`，不会 Reset 或覆盖未提交代码。
- 每次构建使用唯一 Tag，不覆盖 `latest`。
- 更新失败时会恢复镜像配置文件，但仍应根据 Docker 输出检查容器状态。
- API 镜像可能执行数据库迁移，镜像回滚不等于数据库回滚。
- `backup` 会停机并占用额外磁盘空间。

## 13. 最简操作清单

```bash
# 第一次安装
sudo ./scripts/first-deploy.sh

# 第一次用当前源码替换官方业务镜像
sudo ./scripts/pwctl.sh update all

# 后端二开后更新
sudo ./scripts/pwctl.sh update backend

# Admin 二开后更新
sudo ./scripts/pwctl.sh update admin

# App 二开后更新
sudo ./scripts/pwctl.sh update app

# 查看状态和日志
sudo ./scripts/pwctl.sh status
sudo ./scripts/pwctl.sh logs api

# 回滚
sudo ./scripts/pwctl.sh rollback backend
```

日常主要使用 `update backend`、`update admin` 和 `update app` 三条命令即可。
