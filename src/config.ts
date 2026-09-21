/**
 * 站点全局配置
 *
 * 部署资源复用自 gnglue / spire-guide：
 *   - Cloudflare Pages 项目：strategy-guide-site
 *   - 自定义域：https://spireguide.top
 *   - GA4 / AdSense 沿用同一套账号
 */
export const Config = {
  SITE_URL: "https://spireguide.top",
  SITE_NAME: "量化日记",
  SITE_DESCRIPTION: "记录量化交易路上的策略、数据与复盘。",
  SITE_LANGUAGE: "zh-CN",
  SITE_COPYRIGHT: "Licensed under CC BY-NC 4.0.",
  SITE_IMAGE: "/site.png",
  SITE_ICON: "/favicon.ico",

  // 作者信息
  SITE_AUTHOR: "346180990",
  SITE_GITHUB: "https://github.com/346180990",

  // 站点导航分类（需与 posts/*.md 的 category 字段一致）
  SITE_CATEGORIES: ["交易日志", "策略研究", "复盘思考"],

  // 统计与广告（复用 spire-guide 现有资源；置空则不注入脚本）
  GA_MEASUREMENT_ID: "G-5EXR9W01MP",
  ADSENSE_PUBLISHER_ID: "ca-pub-8481130725209151",

  RECENT_POSTS_NUM: 10,
};
