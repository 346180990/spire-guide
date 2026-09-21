import { useState } from "react";
import { GetStaticPaths, GetStaticProps } from "next";
import ArticleCateCard from "@/components/ArticleCateCard";
import Pagination from "@/components/Pagination";
import Layout from "@/components/Layout";

// import { articles } from '@/data/footerData'
import {
    getRecentPostsTitleAndLink,
  getAllPostTagSet,
  getPostDataByTag,
  ParsedMarkdown,
} from "@/utils/posts";

export const getStaticPaths: GetStaticPaths = async () => {
  const tags = getAllPostTagSet();
  // const files = fs.readdirSync(path.join(process.cwd(), "posts"));
  const paths = tags.map((tag) => ({
    params: { slug: tag },
  }));

  return { paths, fallback: false };
};

export const getStaticProps: GetStaticProps = async ({ params }) => {
  const article = getPostDataByTag(`${params?.slug}`);
  const recentPosts = getRecentPostsTitleAndLink()
  const allTagSet = getAllPostTagSet()
  return {
    props: {
      category: `${params?.slug}`,
      cateArticles: article,
      recentPosts: recentPosts,
      hotTags: allTagSet
    },
  };
};

interface CategoryProps {
  category: string;
  cateArticles: ParsedMarkdown[];
  recentPosts: {title: string, id: string}[];
    hotTags: string[];
}

const Category: React.FC<CategoryProps> = ({ category, cateArticles, recentPosts, hotTags }) => {
  const articlesPerPage = 12; // 每页文章数
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(cateArticles.length / articlesPerPage);
  const currentArticles = cateArticles.slice(
    (currentPage - 1) * articlesPerPage,
    currentPage * articlesPerPage,
  );
  return (
    <>
      <Layout recentPosts={recentPosts} hotTags={hotTags}>
        <div className="flex justify-center w-full">
          <div className="pt-[120px] px-[20px] pb-0 max-w-[940px] w-full">
            <h1
              className='relative text-[14px] my-[10px] mx-auto py-0 px-[30px] text-[#5f5f5f]
                        before:content-["#"] before:absolute before:top-0 before:left-[-15px] before:text-[#eb5055] before:py-0 before:px-[30px]'
            >
              {"Tag : " + category}
            </h1>

            <div className="container mx-0 p-0 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 gap-0">
              {currentArticles.map((article, index) => (
                <ArticleCateCard
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
        </div>
      </Layout>
      {/* <Footer recentPosts={allPostTitles} hotTags={allPostTagSet} /> */}
    </>
  );
};

export default Category;
