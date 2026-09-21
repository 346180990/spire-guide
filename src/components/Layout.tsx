import React from "react";
import Header from "./Header";
import Footer from "./Footer";
// import { recentPosts, hotTags } from '@/data/footerData';

// import {getRecentPosts, getAllPostTagSet } from '@/utils/posts'

// export async function getStaticProps() {
//   const allPostTitles = getRecentPosts(10)
//   const allPostTagSet = getAllPostTagSet()
//   return {
//     props: {
//       allPostTitles, allPostTagSet
//     }
//   }
// }

interface BlogLayoutProps {
  children: React.ReactNode;
  recentPosts: {title: string, id: string}[];
  hotTags: string[];
}

const BlogLayout: React.FC<BlogLayoutProps> = ({ children, recentPosts, hotTags }) => {
  return (
    <div className="flex flex-col min-h-screen bg-[#f7f7f7]">
      {/* Header */}
      <Header />

      {/* Main Content */}
      {/* <main className="flex w-full justify-center"> */}
      {children}
      {/* </main> */}

      {/* Footer */}
      <Footer recentPosts={recentPosts} hotTags={hotTags}/>
    </div>
  );
};

export default BlogLayout;
