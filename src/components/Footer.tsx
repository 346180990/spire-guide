import React from "react";
import Link from "next/link";
import SocialLinks from "./SocialLinks";
import { Config } from "@/config"

interface FooterProps {
    recentPosts: {title: string, id: string}[];
    hotTags: string[];
}

// interface Item {
//   id: number;
//   title: string;
// }

const Footer: React.FC<FooterProps> = ({recentPosts, hotTags}) => {
  const currentYear = new Date().getFullYear(); // 获取当前年份
//   const [recentPosts, setRecentPosts] = useState<Item[]>([]);
//   const [loading, setLoading] = useState<boolean>(true);
//   const [error, setError] = useState<string | null>(null);

//   const [hotTags, setHotTags] = useState<string[]>([]);
//   const [hotTagsLoading, setHotTagsLoading] = useState<boolean>(true);
//   const [hotTagsError, setHotTagsError] = useState<string | null>(null);

//   useEffect(() => {
//     async function fetchRecentPosts() {
//       try {
//         const res = await fetch("/api/recent-posts");
//         if (!res.ok) {
//           throw new Error("Failed to fetch recent posts");
//         }
//         const data: Item[] = await res.json();
//         setRecentPosts(data); // 更新状态
//       } catch (err) {
//         setError(err instanceof Error ? err.message : "Unknown error"); // 错误处理
//       } finally {
//         setLoading(false); // 数据加载完毕
//       }
//     }

//     async function fetchHotTags() {
//       try {
//         const res = await fetch("/api/hot-tags");
//         if (!res.ok) {
//           throw new Error("Failed to fetch hot tags");
//         }
//         const data: string[] = await res.json();
//         setHotTags(data);
//       } catch (err) {
//         setHotTagsError(err instanceof Error ? err.message : "Unknown error");
//       } finally {
//         setHotTagsLoading(false);
//       }
//     }
//     if (hotTagsLoading && hotTagsError) {
//     }

//     fetchRecentPosts();
//     fetchHotTags();
//   });

//   if (loading) return <div>Loading...</div>;
//   if (error) return <div>Error: {error}</div>;

  return (
    <footer className="bg-white relative z-1 mt-0 pb-[50px] block unicode-isolate">
      <SocialLinks></SocialLinks>
      <div className="bg-white  pt-[50px]">
        <div
          className="w-full max-w-[960px] h-[250px] mx-auto my-0 py-0 px-[80px] flex
                max-[880px]:px-0
                max-[650px]:justify-end max-[650px]:text-right
                "
        >
          {/* 网站信息 */}
          <div className="flex-1 float-left px-[30px] ">
            <Link href="/" className="text-sm font-sans text-blackCustom">
              {Config.SITE_NAME}
            </Link>
            <div>
              <p className="text-[13px] leading-[20px] m-0 text-grayCustom">
                {"Theme is "}
                <Link href="https://github.com/thedogb/PingRay" target="_blank" className="text-[#767676]">
                  PingRay
                </Link>
                {" by "}
                <Link
                  href="https://thedoga.tech"
                  target="_blank"
                  className="text-[#767676]"
                >
                  Bartender
                </Link>
              </p>
              <p className="mt-1 text-[13px] text-grayCustom">
                © {currentYear} {Config.SITE_NAME} · {Config.SITE_AUTHOR}
              </p>
            </div>
          </div>

          {/* 最近文章 */}
          <div
            className="flex-1 float-left px-[30px]
                    max-[650px]:hidden"
          >
            <h3 className="text-sm font-sans text-title pb-[10px]">
              RECENT POSTS
            </h3>
            <ul className="text-[13px] text-grayCustom m-0 p-0">
              {recentPosts.map((post, index) => (
                <li
                  className="text-[13px] leading-[25px] block overflow-hidden text-[#767676] break-words truncate m-0
                                hover:text-red-500"
                  key={index}
                >
                  <Link
                    href={`/${post.id}`}
                    className="text-[#5f5f5f] outline-none no-underline"
                  >
                    {post.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* 热门标签 */}
          <div
            className="flex-1 float-left px-[30px]
                    max-[650px]:hidden
                    "
          >
            <h3 className="text-sm font-sans text-title pb-[10px]">HOT TAGS</h3>
            {hotTags.map((tag, index) => (
              <li
                key={index}
                className=" hover:text-red-500 text-[13px] leading-[25px] float-left py-0 pr-[7px] pb-0 text-[#767676] break-words list-none"
              >
                <Link href={`/tag/${tag}`} className="text-[#5f5f5f]">
                  {`# ${tag}`}
                </Link>
              </li>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
