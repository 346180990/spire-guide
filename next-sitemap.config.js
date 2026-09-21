/** @type {import('next-sitemap').IConfig} */
module.exports = {
    siteUrl: "https://spireguide.top", // 站点域名
    generateRobotsTxt: true, // 生成 robots.txt
    exclude: ['/admin', '/dashboard'], // 排除某些页面
    changefreq: 'daily', // 更新频率
    priority: 0.7, // 默认优先级
    outDir: './out', // 静态导出目录
  };
