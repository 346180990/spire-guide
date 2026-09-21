import Layout from "@/components/Layout";
import Article from "@/components/Article";
// import fs from "fs";
// import path from "path";
import { GetStaticPaths, GetStaticProps } from "next";
import * as tocbot from "tocbot";
import Headroom from "headroom.js";
import { useEffect } from "react";
// import markdownToHtml from "@/utils/markdownToHtml";
import ArticleHeader from "@/components/ArticleHeader";
// import { blogHeaderData } from '@/data/footerData'
import {
  getAllPostIds,
  getPostData,
  ParsedMarkdown,
  getAllPostTagSet,
  getRecentPostsTitleAndLink
} from "@/utils/posts";
import { NextSeo } from "next-seo";
import { Config } from "@/config";

// import { getAllPostTitles, getAllPostTagSet } from '@/utils/posts'

// export async function getStaticProps() {
//   const allPostTitles = getAllPostTitles()
//   const allPostTagSet = getAllPostTagSet()
//   return {
//     props: {
//       allPostTitles, allPostTagSet
//     }
//   }
// }
// import { blogHeaderData } from '@/data/footerData';

interface BlogPostProps {
  content: string;
  blogHeaderData: ParsedMarkdown;
  recentPosts: {title: string, id: string}[];
  allPostTagSet: string[];
}

export const getStaticPaths: GetStaticPaths = async () => {
  const ids = getAllPostIds();
  // const files = fs.readdirSync(path.join(process.cwd(), "posts"));
  const paths = ids.map((id) => ({
    params: { slug: id },
  }));

  return { paths, fallback: false };
};

export const getStaticProps: GetStaticProps = async ({ params }) => {
  // const filePath = path.join(process.cwd(), "posts", `${params?.slug}.md`);
  // const content = fs.readFileSync(filePath, "utf8");
  // const htmlContent = await markdownToHtml(content);
  const article = getPostData(`${params?.slug}`);
  const htmlContent = article?.contentHTML || "";
  const allPostTagSet = getAllPostTagSet() || [];
  const recentPosts = getRecentPostsTitleAndLink();

  return {
    props: {
      content: htmlContent,
      blogHeaderData: article,
      recentPosts: recentPosts,
      allPostTagSet: allPostTagSet,
    },
  };
};

const BlogPost: React.FC<BlogPostProps> = ({ content, blogHeaderData, recentPosts, allPostTagSet }) => {
  useEffect(() => {
    const tocHeadroom = new Headroom(
      document.getElementById("directory-content")!,
      {
        tolerance: 0,
        offset: 280,
        classes: {
          initial: "initial",
          pinned: "pinned",
          unpinned: "unpinned",
        },
      },
    );

    tocHeadroom.init();

    tocbot.init({
      tocSelector: ".toc",
      contentSelector: ".post-content",
      headingSelector: "h1, h2, h3, h4, h5",
      collapseDepth: 2,
      scrollSmooth: true,
      scrollSmoothDuration: 600,
      scrollSmoothOffset: -80,
      headingsOffset: 80,
    });
  });

  return (
    <>
      <NextSeo
        title={blogHeaderData.title || ""}
        description={blogHeaderData.description || ""}
        canonical={Config.SITE_URL + "/" + (blogHeaderData.id || "")}
        openGraph={{
          url: Config.SITE_URL + "/" + (blogHeaderData.id || ""),
          title: blogHeaderData.title || "",
          description: blogHeaderData.description || "",
          images: [
            {
              url: blogHeaderData.firstImage || "", // 这里不需要 {}
              width: 800,
              height: 600,
              alt: blogHeaderData.title || "", // 这里不需要 {}
            },
          ],
          site_name: Config.SITE_NAME,
        }}
      />
      <Layout recentPosts={recentPosts} hotTags={allPostTagSet}>
        <ArticleHeader
          title={blogHeaderData.title || ""}
          date={blogHeaderData.createdAt || ""}
          category={blogHeaderData.category || ""}
          comments={0}
          tags={blogHeaderData.tags || [""]}
          imgLink={blogHeaderData.firstImage || ""}
        ></ArticleHeader>
        <div className="flex w-full justify-center bg-white">
          <main className="w-full max-w-[700px] pt-[30px] pb-[20px] post-content">
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
    </>
  );
};

export default BlogPost;
