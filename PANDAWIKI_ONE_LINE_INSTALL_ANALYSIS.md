# PandaWiki 一行命令安装过程分析

> 分析对象：
>
> ```bash
> bash -c "$(curl -fsSLk https://release.baizhi.cloud/panda-wiki/manager.sh)"
> ```
>
> 分析时间：2026-08-30。远端安装资源可能随版本发布而变化。本文基于当前 `manager.sh`、当前安装器二进制的静态分析、当前 `.env.template`、当前 `docker-compose.yml` 以及仓库代码整理。分析过程中没有实际执行安装器。

## 1. 一句话结论

这条命令并不是直接安装 PandaWiki，而是以 root 权限下载并执行一个 Go 安装器。安装器检查服务器环境、必要时协助安装 Docker/Compose、生成随机密码、下载 Compose 配置、拉取 12 个容器镜像并执行 `docker compose up -d`，最终输出管理后台地址、用户名和随机密码。

```text
远程 manager.sh
  → 检查 root 和 CPU 架构
  → 下载对应架构的 Go 安装器到 /tmp
  → 安装器检查 Docker、Compose 和系统资源
  → 选择/创建安装目录
  → 下载 docker-compose.yml 和 .env.template
  → 生成 7 个随机密钥/密码
  → 拉取 12 个服务镜像
  → Docker Compose 后台启动
  → API 执行数据库迁移并初始化系统
  → 输出 https://服务器IP:2443、admin 和随机密码
```

## 2. 第一层：Shell 一行命令做了什么

命令可以拆成两部分：

```bash
curl -fsSLk https://release.baizhi.cloud/panda-wiki/manager.sh
```

负责下载入口脚本：

- `-f`：HTTP 返回错误状态码时失败。
- `-s`：静默模式。
- `-S`：静默模式下仍显示错误。
- `-L`：跟随 HTTP 重定向。
- `-k`：跳过 HTTPS 证书校验。

下载结果通过命令替换直接交给：

```bash
bash -c "脚本内容"
```

也就是说，服务器不会先把 `manager.sh` 保存下来供管理员审查，而是立即执行当前远端返回的内容。

## 3. 第二层：`manager.sh` 做了什么

当前 `manager.sh` 很短，真正的安装逻辑不在 Shell 中。

### 3.1 设置失败处理

- 启用 `set -e`，任一未处理命令失败后终止。
- 注册 `ERR` Trap，失败时打印行号和退出码。
- 退出前删除临时安装器 `/tmp/panda-wiki-installer`。

### 3.2 检查 CPU 架构

支持：

- `x86_64` / `amd64`
- `aarch64` / `arm64` / `armv8l`

其他架构直接退出。

### 3.3 要求 root 权限

脚本检查 `EUID`，不是 root 就退出。这是因为后续流程可能需要安装 Docker/Compose、写入系统级插件目录并创建 Docker 网络、容器和数据目录。

### 3.4 下载 Go 安装器

根据架构选择：

```text
https://release.baizhi.cloud/panda-wiki/installer_amd64
https://release.baizhi.cloud/panda-wiki/installer_arm64
```

下载命令使用 IPv4 和跳过证书校验：

```bash
curl -4sSLk -o /tmp/panda-wiki-installer "$URL"
```

然后执行：

```bash
chmod +x /tmp/panda-wiki-installer
/tmp/panda-wiki-installer
```

安装结束后删除该临时二进制。

当前获取的 amd64 安装器是静态链接的 Linux ELF，可见构建信息如下：

- Go 版本：1.24.13
- 架构：linux/amd64
- 大小：约 9.1 MiB
- SHA-256：`37500946fa579d976344d3ed1caa3cd13f4cd5df166009c77b62636de6fe95fb`

该哈希只表示本文分析时获取的文件，不是安装脚本内置的官方校验值。

## 4. 第三层：Go 安装器做了什么

安装器是一个通用交互式安装程序，支持安装、升级和卸载。首次部署时走“安装”流程。

### 4.1 加载 PandaWiki 安装配置

安装器内嵌 `app_config/pandawiki.yaml`，其中定义了：

- 产品名和用于判断安装状态的容器名 `panda-wiki-api`。
- Docker、Compose、CPU、内存、磁盘最低要求。
- Compose 文件和环境变量模板下载地址。
- 固定变量、随机变量和安装完成后的输出模板。

### 4.2 检查服务器资源

当前最低要求为：

| 项目           | 最低要求       |
| -------------- | -------------- |
| 操作系统       | Linux          |
| CPU 架构       | amd64 或 arm64 |
| CPU            | 1 核           |
| 内存           | 1 GiB          |
| 可用磁盘       | 5 GiB          |
| Docker         | 20.0.0         |
| Docker Compose | 1.10.0         |

这些是安装器的准入下限，不等于推荐生产配置。RAGLite、Qdrant、PostgreSQL、AnyDoc 与前后端同时运行时，1 核 1 GiB 只适合作为格式上的最低检查值。

### 4.3 检查或安装 Docker

静态分析显示安装器会：

- 执行 Docker 版本检查。
- Docker 未安装时提示是否安装。
- 检测可用的 Docker 下载源并选择响应较好的源。
- 安装完成后重新检查 Docker 服务和版本。

安装器中包含 Docker 官方源、国内镜像源和远程安装脚本相关逻辑。因此用户确认安装 Docker 后，这一步会修改宿主机的软件包、Docker 服务和系统配置，不只是修改 PandaWiki 目录。

### 4.4 检查或安装 Docker Compose Plugin

安装器优先使用 `docker compose` 插件模式，而不是旧的独立 `docker-compose` 命令。

它会：

- 检查 Compose Plugin 是否存在及版本是否满足要求。
- 缺失或版本过低时询问是否安装/重装。
- 根据 CPU 架构选择 Compose 二进制。
- 在 GitHub、阿里云、腾讯云等来源间选择下载源。
- 尝试写入 Docker CLI Plugin 标准目录，例如：
  - `/usr/local/lib/docker/cli-plugins/docker-compose`
  - `/usr/lib/docker/cli-plugins/docker-compose`
  - `/usr/libexec/docker/cli-plugins/docker-compose`
- 添加执行权限，并重新运行 `docker compose version` 验证。

因此，如果宿主机缺少 Compose，这一步会产生系统级文件。

### 4.5 查找已有安装

安装器会从 Docker 容器的 Compose Label 中查找已有安装目录，使用的标签包括：

```text
com.docker.compose.project.working_dir
```

如果发现已有 PandaWiki，重新执行同一行命令时会进入操作选择，可继续升级或卸载，而不是无条件再安装一份。

### 4.6 选择并准备安装目录

安装器会要求输入安装目录。静态分析可见默认目录采用 `/data/%s` 模式，PandaWiki 对应的通常是：

```text
/data/pandawiki
```

如果目录已存在但不是有效安装，安装器会询问是否清空目录。确认后可能删除该目录中的现有内容，因此自定义安装目录时必须确保目标目录没有其他数据。

### 4.7 下载部署文件

安装器从当前发布站下载：

```text
https://release.baizhi.cloud/panda-wiki/docker-compose.yml
https://release.baizhi.cloud/panda-wiki/.env.template
```

安装目录中至少会形成：

```text
安装目录/
├── docker-compose.yml
├── .env
└── data/
    ├── caddy/
    ├── nginx/
    ├── postgres/
    ├── redis/
    ├── minio/
    ├── nats/
    ├── qdrant/
    └── raglite/
```

其中 `.env` 是根据模板渲染后的真实配置文件。

### 4.8 生成账号、密码和密钥

安装器固定生成/写入：

| 变量                         | 用途                 |
| ---------------------------- | -------------------- |
| `ADMIN_USER=admin`         | 管理后台用户名       |
| `ADMIN_PORT=2443`          | 管理后台宿主机端口   |
| `SUBNET_PREFIX=169.254.15` | Compose 私有网段前缀 |
| `TIMEZONE=Asia/Shanghai`   | 时区                 |

并为以下变量各生成一个 32 位随机值：

| 变量                  | 用途                  |
| --------------------- | --------------------- |
| `POSTGRES_PASSWORD` | PostgreSQL 密码       |
| `NATS_PASSWORD`     | NATS 用户密码         |
| `JWT_SECRET`        | 管理 API JWT 签名密钥 |
| `S3_SECRET_KEY`     | MinIO/S3 Secret Key   |
| `REDIS_PASSWORD`    | Redis 密码            |
| `ADMIN_PASSWORD`    | 初始管理员密码        |
| `QDRANT_API_KEY`    | Qdrant API Key        |

这些敏感值以明文形式写入安装目录下的 `.env`。该文件应限制权限、纳入备份，但不能提交到代码仓库或公开分享。

### 4.9 拉取镜像

安装器读取 Compose 文件中的镜像并执行相当于：

```bash
docker compose pull
```

当前部署引用的 PandaWiki 应用版本为 `v3.87.0`，并同时拉取 PostgreSQL、Redis、MinIO、NATS、Qdrant、AnyDoc、RAGLite 和 Caddy 镜像。

### 4.10 启动容器

镜像拉取完成后执行相当于：

```bash
docker compose up -d
```

`-d` 表示全部服务在后台运行。安装器会检查启动输出，并对端口占用等错误给出提示。

## 5. 实际部署的 12 个服务

| Compose 服务 | 容器名                  | 主要职责                                     | 持久化目录                                        |
| ------------ | ----------------------- | -------------------------------------------- | ------------------------------------------------- |
| `caddy`    | `panda-wiki-caddy`    | 用户知识库站点入口、动态域名/端口和 TLS 路由 | `data/caddy/`                                   |
| `nginx`    | `panda-wiki-nginx`    | 管理后台静态文件和 API/文件反向代理          | `data/nginx/ssl/`                               |
| `app`      | `panda-wiki-app`      | Next.js 用户端 Wiki 站点                     | 无独立数据卷                                      |
| `api`      | `panda-wiki-api`      | Go HTTP API、系统初始化、数据库迁移          | `data/conf/api/`、Caddy Socket、SSL 目录        |
| `consumer` | `panda-wiki-consumer` | NATS 异步任务、RAG 入库、定时任务            | 依赖外部存储                                      |
| `postgres` | `panda-wiki-postgres` | 业务数据库和 RAGLite PostgreSQL 数据库       | `data/postgres/`                                |
| `redis`    | `panda-wiki-redis`    | 缓存、Session、临时统计和锁                  | `data/redis/`                                   |
| `minio`    | `panda-wiki-minio`    | 文档、图片和附件对象存储                     | `data/minio/`                                   |
| `nats`     | `panda-wiki-nats`     | 消息队列和 JetStream                         | `data/nats/`                                    |
| `qdrant`   | `panda-wiki-qdrant`   | 向量数据库                                   | `data/qdrant/`                                  |
| `crawler`  | `panda-wiki-crawler`  | AnyDoc 文档解析与第三方内容抓取              | 结果写入 MinIO/NATS                               |
| `raglite`  | `panda-wiki-raglite`  | 数据集、切片、Embedding、Rerank 和检索       | `data/raglite/`，并使用 PostgreSQL/Qdrant/MinIO |

全部服务都配置了 `restart: always`，因此 Docker 服务或服务器重启后会自动拉起。

## 6. 容器网络和端口发生了什么

### 6.1 私有网络

Compose 创建一个 `/24` 网络：

```text
169.254.15.0/24
```

默认固定地址如下：

| 地址               | 服务           |
| ------------------ | -------------- |
| `169.254.15.2`   | API            |
| `169.254.15.3`   | Consumer       |
| `169.254.15.10`  | PostgreSQL     |
| `169.254.15.11`  | Redis          |
| `169.254.15.12`  | MinIO          |
| `169.254.15.13`  | NATS           |
| `169.254.15.14`  | Qdrant         |
| `169.254.15.17`  | AnyDoc/Crawler |
| `169.254.15.18`  | RAGLite        |
| `169.254.15.111` | Nginx/Admin    |
| `169.254.15.112` | Next.js App    |

如果该网段与宿主机、VPN 或现有 Docker 网络冲突，需要修改 `.env` 中的 `SUBNET_PREFIX` 后重新启动。

### 6.2 对外端口

Compose 显式映射的管理后台端口为：

```text
宿主机 2443 → Nginx 容器 8080
```

Caddy 使用 `network_mode: host`，会直接使用宿主机网络。知识库创建后，后端通过 Caddy Admin Unix Socket 动态下发站点端口、域名、证书和反向代理配置。

PostgreSQL、Redis、MinIO、NATS、Qdrant 和 RAGLite没有直接映射到公网，只在 Compose 网络内通信。

## 7. 容器启动后，系统内部如何完成初始化

执行 `docker compose up -d` 后还会继续发生以下事情：

1. PostgreSQL 启动并创建 `panda-wiki` 主数据库。
2. API 镜像先运行 `panda-wiki-migrate`，执行 SQL Schema 迁移和业务数据迁移。
3. API 启动时确保 `raglite` 数据库存在。
4. API 根据 `ADMIN_PASSWORD` 初始化或提供初始管理员账号。
5. API 检查/生成管理端使用的自签名 TLS 证书，并写入与 Nginx 共享的 SSL 目录。
6. API 连接 Redis、MinIO、NATS、RAGLite 等服务。
7. MinIO 客户端检查并创建 `static-file` Bucket。
8. NATS Producer 检查并创建摘要、向量和抓取相关 JetStream。
9. Consumer 注册消息处理器并启动统计聚合、状态同步、旧数据清理等 Cron 任务。
10. 后端把知识库访问配置同步到 Caddy；Caddy 再将用户请求转发到 API、Next.js 或 MinIO。

需要注意，Compose 的 `depends_on` 主要控制启动顺序，不代表所有依赖服务已经完全就绪。容器配置了 `restart: always`，早期连接失败的服务通常会由 Docker 自动重启后再次连接。

## 8. 为什么最后显示“部署成功”

安装器在以下阶段没有返回错误时认为安装完成：

- 环境检查通过。
- 安装目录和部署文件准备成功。
- 随机变量生成和 `.env` 渲染成功。
- `docker compose pull` 成功。
- `docker compose up -d` 成功启动容器。

然后它读取本机 IP 和公网 IP，输出：

```text
访问地址(内网): https://<LOCAL_IP>:2443
访问地址(外网): https://<REMOTE_IP>:2443
用户名: admin
密码: <随机生成的 ADMIN_PASSWORD>
```

“部署成功”主要表示 Compose 已成功创建并启动容器，不等同于所有业务功能都已完成深度健康检查。首次启动时数据库迁移、镜像初始化、RAGLite 和各中间件就绪仍可能需要一些时间。

## 9. 对宿主机产生的变更汇总

### 一定会发生

- 从外部发布站下载并以 root 执行安装器。
- 创建安装目录、`.env`、`docker-compose.yml` 和 `data/` 数据目录。
- 下载多个容器镜像。
- 创建 12 个容器。
- 创建 Docker Bridge 网络和固定 IP。
- 将管理端口 `2443` 绑定到宿主机。
- 让 Caddy 使用宿主机网络。
- 创建 `/run/pandawiki` 相关挂载路径。
- 写入 PostgreSQL、Redis、MinIO、NATS、Qdrant、RAGLite 持久化数据。

### 视服务器环境和用户确认而定

- 安装或升级 Docker。
- 安装或替换 Docker Compose Plugin。
- 向 `/usr/local/lib/docker/cli-plugins/` 等系统目录写入文件。
- 清空已存在但不是有效安装的目标目录。

## 10. 安全和运维注意事项

### 10.1 远程脚本以 root 直接执行

命令同时使用“远程内容直接交给 Bash”和 `curl -k`，并且 `manager.sh` 下载二进制时也使用 `-k`。这意味着 TLS 证书不被校验，安装器也没有在入口脚本中做固定 SHA-256 或数字签名验证。

更稳妥的执行方式是先下载、检查，再运行：

```bash
curl -fSL https://release.baizhi.cloud/panda-wiki/manager.sh -o manager.sh
less manager.sh
bash manager.sh
```

但即使先审查 `manager.sh`，它仍会继续下载二进制安装器；严格环境中还应固定安装器、Compose 文件和镜像版本并校验哈希或签名。

### 10.2 `.env` 包含全部核心密钥

安装目录下的 `.env` 包含数据库、消息队列、JWT、对象存储、Redis、Qdrant 和管理员密码。应：

- 限制只有 root/运维账号可读。
- 安全备份。
- 禁止提交 Git。
- 泄漏后立即轮换相关密钥。

### 10.3 初始管理后台使用自签名证书

默认访问地址是 `https://IP:2443`，证书由 API 初始化逻辑自签名生成，因此浏览器首次访问可能提示证书不受信任。正式部署应配置可信域名和正式证书。

### 10.4 Caddy 使用 Host 网络

Caddy 具有 `NET_ADMIN` Capability 且使用宿主机网络。它是多知识库站点的核心入口，应限制 Caddy Admin Socket 权限，并通过防火墙控制实际开放端口。

### 10.5 最低资源要求偏低

当前一套 Compose 同时包含数据库、缓存、对象存储、消息队列、向量库、RAG 服务、爬虫、API、消费者和两个前端。正式环境应根据文档量、并发量和模型调用量显著提高 CPU、内存和磁盘配置，并监控数据目录容量。

## 11. 部署完成后的建议检查

进入实际安装目录后执行：

```bash
docker compose ps
docker compose logs --tail=200 api
docker compose logs --tail=200 consumer
docker compose logs --tail=200 raglite
```

重点确认：

- 12 个容器没有持续重启。
- PostgreSQL Healthcheck 通过。
- API 数据库迁移成功。
- API 能连接 Redis、NATS、MinIO 和 RAGLite。
- `https://服务器IP:2443` 可以访问。
- 使用安装器输出的 `admin` 和随机密码可以登录。
- 防火墙已放行真正需要的端口，内部中间件没有额外暴露。

## 12. 分析依据

- 仓库安装入口：`README.md`
- 在线入口脚本：[https://release.baizhi.cloud/panda-wiki/manager.sh](https://release.baizhi.cloud/panda-wiki/manager.sh)
- 在线 Compose：[https://release.baizhi.cloud/panda-wiki/docker-compose.yml](https://release.baizhi.cloud/panda-wiki/docker-compose.yml)
- 在线环境模板：[https://release.baizhi.cloud/panda-wiki/.env.template](https://release.baizhi.cloud/panda-wiki/.env.template)
- 安装器内嵌配置：`app_config/pandawiki.yaml`（通过当前二进制静态分析获得）
- 后端启动与配置：`backend/Dockerfile.api`、`backend/config/config.go`
- 存储和消息初始化：`backend/store/`、`backend/mq/nats/`
- Caddy 动态路由：`backend/repo/pg/knowledge_base.go`
