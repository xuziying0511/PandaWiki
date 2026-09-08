<p align="center">
  <img src="/images/banner.png" width="400" />
</p>

<p align="center">
  <a target="_blank" href="https://ly.safepoint.cloud/Br48PoX">📖 官方网站</a>   |  
  <a target="_blank" href="/images/wechat.png">🙋‍♂️ 微信交流群</a>
</p>

## 👋 项目介绍（xzy/）

PandaWiki 是一款 AI 大模型驱动的**开源知识库搭建系统**，帮助你快速构建智能化的 **产品文档、技术文档、FAQ、博客系统**，借助大模型的力量为你提供 **AI 创作、AI 问答、AI 搜索** 等能力。

<p align="center">
  <img src="/images/setup.png" width="800" />
</p>

## ⚡️ 界面展示

| PandaWiki 控制台 | Wiki 网站前台 |
| ---------------- | ------------- |
|                  |               |
|                  |               |

## 🔥 功能与特色

- AI 驱动智能化：AI 辅助创作、AI 辅助问答、AI 辅助搜索。
- 强大的富文本编辑能力：兼容 Markdown 和 HTML，支持导出为 word、pdf、markdown 等多种格式。
- 轻松与第三方应用进行集成：支持做成网页挂件挂在其他网站上，支持做成钉钉、飞书、企业微信等聊天机器人。
- 通过第三方来源导入内容：根据网页 URL 导入、通过网站 Sitemap 导入、通过 RSS 订阅、通过离线文件导入等。

## 🚀 上手指南

### 安装 PandaWiki

你需要一台支持 Docker 20.x 以上版本的 Linux 系统来安装 PandaWiki。

使用 root 权限登录你的服务器，然后执行以下命令。

```bash
bash -c "$(curl -fsSLk https://release.baizhi.cloud/panda-wiki/manager.sh)"
```

根据命令提示的选项进行安装，命令执行过程将会持续几分钟，请耐心等待。

> 关于安装与部署的更多细节请参考 [安装 PandaWiki](https://pandawiki.docs.baizhi.cloud/node/01971602-bb4e-7c90-99df-6d3c38cfd6d5)。

### 登录 PandaWiki

在上一步中，安装命令执行结束后，你的终端会输出以下内容。

```
SUCCESS  控制台信息:
SUCCESS    访问地址(内网): http://*.*.*.*:2443
SUCCESS    访问地址(外网): http://*.*.*.*:2443
SUCCESS    用户名: admin
SUCCESS    密码: **********************
```

使用浏览器打开上述内容中的 “访问地址”，你将看到 PandaWiki 的控制台登录入口，使用上述内容中的 “用户名” 和 “密码” 登录即可。

### 配置 AI 模型

> PandaWiki 是由 AI 大模型驱动的 Wiki 系统，在未配置大模型的情况下 AI 创作、AI 问答、AI 搜索 等功能无法正常使用。

首次登录时会提示需要先配置 AI 模型，可自行选择一键配置或手动配置。

<div align="center">
  <img src="/images/model-config-1.png" width="800" />
  <p><em>一键自动配置 AI 模型</em></p>
