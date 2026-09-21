import { useState } from "react";
import ArticleCard from "@/components/ArticleCard";
import Pagination from "@/components/Pagination";
import Layout from "@/components/Layout";
import { NextSeo } from "next-seo";
import { Config } from "@/config";

// import { articles } from '@/data/footerData'
import {
    getRecentPostsTitleAndLink,
  getAllPostTagSet,
  getSortedPostsData,
  ParsedMarkdown,
} from "@/utils/posts";

interface HomeProps {
  allPostTitles: { title: string; id: string }[];
  allPostTagSet: string[];
  allArticles: ParsedMarkdown[];
}

export async function getStaticProps() {
  const allPostTitles = getRecentPostsTitleAndLink();
  const allPostTagSet = getAllPostTagSet();
  const allArticles = getSortedPostsData();
  return {
    props: {
      allPostTitles,
      allPostTagSet,
      allArticles,
    },
  };
}

export default function Home({ allArticles, allPostTitles, allPostTagSet }: HomeProps) {
  const articlesPerPage = 12; // 每页文章数
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(allArticles.length / articlesPerPage);
  const currentArticles = allArticles.slice(
    (currentPage - 1) * articlesPerPage,
    currentPage * articlesPerPage,
  );
  return (
    <>
      <NextSeo
        title={Config.SITE_NAME}
        description={Config.SITE_DESCRIPTION}
        canonical={Config.SITE_URL}
        openGraph={{
          url: Config.SITE_URL,
          title: Config.SITE_NAME,
          description: Config.SITE_DESCRIPTION,
          images: [
            {
              url: Config.SITE_URL + Config.SITE_IMAGE, // 这里不需要 {}
              width: 800,
              height: 600,
              alt: Config.SITE_NAME, // 这里不需要 {}
            },
          ],
          site_name: Config.SITE_NAME,
        }}
      />
      <Layout recentPosts={allPostTitles} hotTags={allPostTagSet}>
        <div className="min-h-screen  w-full pt-[120px] px-[20px]  ">
          <div className="max-w-[900px] grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 my-0 mx-auto">
            {currentArticles.map((article, index) => (
              <ArticleCard
                key={index}
                title={article.title || ""}
                date={article.createdAt || ""}
                category={article.category || ""}
                image={article.firstImage || ""}
                description={article.description || ""}
                id={article.id || ""}
              />
            ))}
          </div>

          {/* 分页组件 */}
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={(page) => setCurrentPage(page)}
          />
        </div>
      </Layout>
    </>
    // {/* <Footer recentPosts={allPostTitles} hotTags={allPostTagSet} /> */}
  );
}
