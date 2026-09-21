import type { NextConfig } from "next";
import generateRSS from "@/utils/genRss";

const nextConfig: NextConfig = {
  // 站点为纯静态（仅 getStaticProps / getStaticPaths），
  // 因此直接静态导出为 out/，交由 Cloudflare Pages 托管。
  output: "export",

  images: {
    // 静态导出不支持 Next 的图片优化服务
    unoptimized: true,
    domains: ["cdn.jsdelivr.net"], // 允许的图片域名
  },

  webpack: (config, { isServer }) => {
    if (isServer) {
      generateRSS(); // 只在构建时生成 public/rss.xml
    }
    return config;
  },
};

export default nextConfig;
