// import { Feed } from "feed";
// @ts-expect-error rss 没有声明文件
import RSS from "rss";
import fs from "fs"
import path from "path"
import { getRecentPosts } from "../utils/posts";
import { Config } from "../config";
// import { GetServerSideProps } from "next";
// import { NextApiRequest, NextApiResponse } from 'next';
// import RSS from 'rss';

function generateRSS() {
  // 示例数据，实际项目中你可以从数据库或 API 获取数据
  const posts = getRecentPosts(20);
  const feed = new RSS({
    title: Config.SITE_NAME,
    description: Config.SITE_DESCRIPTION,
    site_url: Config.SITE_URL,
    feed_url: `${Config.SITE_URL}/rss.xml`,
    language: Config.SITE_LANGUAGE,
    // updated: new Date(),
    // generator: "Next.js RSS Generator",
    // feedLinks: {
    // rss: `${Config.SITE_URL}/rss.xml`
    // },
    copyright: `© ${new Date().getFullYear()} ${Config.SITE_NAME}. ${Config.SITE_COPYRIGHT}`,
  });

  posts.forEach((post) => {
    feed.item({
      title: post.title || "",
      description: post.description || "",
      url: `${Config.SITE_URL}/${post.id || ""}`,
      date: new Date(post.createdAt || "1997-01-01"),
    });
  });

    // 确保 public 目录存在
    const outputDir = path.join(process.cwd(), "public");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

  // 生成 RSS 文件
    fs.writeFileSync(path.join(outputDir, "rss.xml"), feed.xml({ indent: true, encoding: "UTF-8" }));
    console.log("✅ RSS feed generated successfully!");
  return ;
}

// generateRSS();
export default generateRSS;
// Next.js API route support: https://nextjs.org/docs/api-routes/introduction

// export const getServerSideProps: GetServerSideProps = async ({ res }) => {
//   res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
//   res.write(generateRSS());
//   res.end();
//   return { props: {} };
// };

// export default function RSSPage() {
//   return null; // 这个页面不会渲染 HTML
// }

// export default function handler(
//   req: NextApiRequest,
//   res: NextApiResponse,
// ) {
//     const rss = generateRSS()
//   res.status(200).send(rss)
// }
