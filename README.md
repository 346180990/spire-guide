# 量化日记

记录量化交易路上的策略、数据与复盘。

线上地址：<https://spireguide.top>

## 技术栈

- **Next.js 15**（Pages Router）+ TypeScript + Tailwind CSS
- **纯静态**：全部页面使用 `getStaticProps` / `getStaticPaths`，`next build` 直接导出静态站点到 `out/`
- **Cloudflare Workers（静态资源模式）** 托管
- 支持 **Markdown**、**LaTeX 公式**（KaTeX）、**Mermaid 流程图**、代码高亮、RSS、sitemap
- 主题基于 [PingRay](https://github.com/thedogb/PingRay) by [Bartender](https://thedoga.tech)（MIT）

## 写文章

在 `posts/` 目录下新建 `.md` 文件，文件名即 URL（`posts/foo.md` → `/foo`）。

```markdown
---
title: "文章标题"
description: "卡片与 SEO 用的摘要"
tags: ["因子", "回测"]
category: 策略研究
createdAt: "2026-09-21"
updatedAt: "2026-09-21"
---

正文……
```

`category` 必须是 `src/config.ts` 中 `SITE_CATEGORIES` 里的值之一（决定导航栏）：

- `交易日志`
- `策略研究`
- `复盘思考`

文章没有配图时，卡片会自动使用渐变兜底封面，无需强制配图。

## 本地开发

```bash
npm install
npm run dev          # http://localhost:3000
```

## 构建与预览

```bash
npm run build        # 静态导出到 out/，并生成 sitemap / rss.xml
npm run preview      # 本地静态预览 out/
```

## 部署到 Cloudflare

站点复用现有资源：

| 资源 | 值 |
| --- | --- |
| Worker 名称 | `strategy-guide-site` |
| 自定义域 | `https://spireguide.top` |
| GA4 | `G-5EXR9W01MP` |
| AdSense | `ca-pub-8481130725209151` |

站点是纯静态导出，因此以 **Assets-only Worker** 方式部署（见 `wrangler.jsonc`），无需 Worker 入口脚本。

```bash
npx wrangler login   # 首次需要浏览器授权；CI/非交互环境改用 CLOUDFLARE_API_TOKEN
npm run deploy       # 构建 out/ 并 wrangler deploy
```

只构建不上传（用于本地校验产物）：

```bash
npm run build && npx wrangler deploy --dry-run
```

> 注意：旧的攻略站代码仍完整保留在本仓库 git 历史中（提交 `c7180cd`），
> 需要回滚时执行 `git checkout c7180cd -- .` 后重新构建部署即可。

## 站点配置

所有站点级配置集中在 `src/config.ts`：

| 字段 | 说明 |
| --- | --- |
| `SITE_URL` | 生产域名，用于 canonical / sitemap / RSS |
| `SITE_NAME` | 站点名（导航栏、页脚、SEO 标题） |
| `SITE_DESCRIPTION` | 站点描述，用于 SEO |
| `SITE_AUTHOR` / `SITE_GITHUB` | 页脚署名与社交链接 |
| `SITE_CATEGORIES` | 导航栏分类，需与文章 `category` 一致 |
| `GA_MEASUREMENT_ID` | GA4 衡量 ID，置空则不注入统计脚本 |
| `ADSENSE_PUBLISHER_ID` | AdSense 发布商 ID，置空则不注入广告脚本 |

## 目录结构

```
posts/                  文章（Markdown）
public/                 静态资源（_redirects 由 Cloudflare Pages 解析）
src/
  config.ts             站点配置
  components/           Header / Footer / 卡片 / 文章渲染等
  pages/                路由：首页、关于、友链、[slug]、category/、tag/
  utils/posts.ts        文章解析（frontmatter + 目录提取）
  utils/genRss.ts       构建期生成 RSS
next.config.ts          output: 'export' 等构建配置
next-sitemap.config.js  sitemap / robots 生成
```

## License 许可证

本站内容版权归作者所有。

主题代码基于 [PingRay](https://github.com/thedogb/PingRay)，依 MIT 许可证开源。
