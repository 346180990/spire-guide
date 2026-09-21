import Layout from "@/components/Layout";
import Article from "@/components/Article";
import fs from "fs";
import { GetStaticProps } from "next";
import { getAllPostTagSet, getRecentPostsTitleAndLink } from "@/utils/posts";
import { Config } from "@/config";

// 友链列表：需要新增时在这里追加即可
const friendLinks: { name: string; url: string; description?: string }[] = [];

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
  const hotTags= getAllPostTagSet()

  return {
    props: {
      lastModifiedISOTime,
      lastModifiedLocaleTime,
      recentPosts,
      hotTags
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
  hotTags
}) => {
  const content = friendLinks.length
    ? `<ul>
${friendLinks
  .map(
    (link) =>
      `\t<li><a href="${link.url}" target="_blank" rel="noopener noreferrer">${link.name}</a>${
        link.description ? ` —— ${link.description}` : ""
      }</li>`,
  )
  .join("\n")}
</ul>`
    : `<p>这里还没有友链。如果你也在写量化、交易或数据相关的内容，欢迎到 <a href="${Config.SITE_GITHUB}" target="_blank" rel="noopener noreferrer">GitHub</a> 找我交换链接。</p>`;

  return (
    <Layout recentPosts={recentPosts} hotTags={hotTags}>
      <div className="flex w-full justify-center bg-white">
        <main className="w-full max-w-[700px] pt-[130px] pb-[20px] px-[25px] animate-fadeIn">
          <h1 className="text-[21px]">友链</h1>
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
