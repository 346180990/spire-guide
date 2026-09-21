import Layout from "@/components/Layout";
import Article from "@/components/Article";
import fs from "fs";
import { GetStaticProps } from "next";
import { getRecentPostsTitleAndLink, getAllPostTagSet } from "@/utils/posts";
import { Config } from "@/config";

export const getStaticProps: GetStaticProps = async () => {
  const filePath = __filename; // 获取当前文件路径
  const fileStats = fs.statSync(filePath);
  const lastModifiedISOTime = fileStats.mtime.toISOString(); // 转换为 ISO 格式
  const lastModifiedLocaleTime = fileStats.mtime.toLocaleDateString("en-US", {
    month: "short", // "Nov"
    day: "2-digit", // "13"
    year: "numeric", // "2024"
  }); // 转换为 ISO 格式

  const recentPosts = getRecentPostsTitleAndLink()
  const allTagSet = getAllPostTagSet()

  return {
    props: {
      lastModifiedISOTime,
      lastModifiedLocaleTime,
      recentPosts: recentPosts,
      hotTags: allTagSet
    },
  };
};

interface Props {
  lastModifiedISOTime: string;
  lastModifiedLocaleTime: string;
  recentPosts: {title: string, id: string}[];
  hotTags: string[];
}

const BlogPost: React.FC<Props> = ({
  lastModifiedLocaleTime,
  lastModifiedISOTime,
  recentPosts,
  hotTags,
}) => {
  const content = `
这里是我的**量化日记**——一个只写给自己、也顺便公开的量化交易笔记本。

写这个博客的初衷很简单：量化这件事，想法很容易骗自己，只有落到纸面上的记录才不会。

所以这里的文章大致分三类：

- **交易日志**：每天/每周真实发生了什么，持仓、盈亏、情绪与执行偏差，不做美化。
- **策略研究**：因子、模型、回测与参数，写清楚假设、数据口径和失效条件。
- **复盘思考**：阶段的总结、踩过的坑，以及那些"当时觉得对、后来发现错了"的判断。

我不承诺这里的观点正确，我只承诺它们是当时真实的想法。如果某篇文章后来被证伪，我会保留原文并在下方补记，而不是悄悄删掉。

## 关于技术

本站基于 [PingRay](https://github.com/thedogb/PingRay) 主题构建，Next.js 静态导出，部署在 Cloudflare Pages。
支持 Markdown 写作、LaTeX 公式与 Mermaid 流程图——这三样正好够把量化想法讲清楚。

## 联系

代码与项目都在 [GitHub](${Config.SITE_GITHUB})，欢迎交流。
    `;

  return (
    <Layout recentPosts={recentPosts} hotTags={hotTags}>
      <div className="flex w-full justify-center bg-white">
        <main className="w-full max-w-[700px] pt-[130px] pb-[20px] px-[25px] animate-fadeIn">
          <h1 className="text-[21px]">关于</h1>
          <div className="post-data text-[12px] text-[#5f5f5f]">
            <time dateTime={lastModifiedISOTime} itemProp="datePublished">
              Published on {lastModifiedLocaleTime}
            </time>
          </div>
          <Article content={content} />
        </main>
        {/* <aside className="w-1/4">
          <Toc content={content} />
        </aside> */}
      </div>
      <div
        id="directory-content"
        className="directory-content  max-[1000px]:hidden"
      >
        <nav className="toc js-toc"></nav>
      </div>
    </Layout>
  );
};

export default BlogPost;
