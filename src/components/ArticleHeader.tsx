import React from "react";
import Image from "next/image";

interface BlogHeaderProps {
  title: string;
  date: string;
  category: string;
  comments: number;
  tags: string[];
  imgLink: string;
}

const ArticleHeader: React.FC<BlogHeaderProps> = ({
  title,
  date,
  category,
  comments,
  tags,
  imgLink,
}) => {
  return (
    <div className="relative w-full h-[250px] mt-[70px] bg-black bg-opacity-50">
      {/* <div className="absolute inset-0 w-full h-[300px] bg-center bg-cover blur-[8px]"> */}
      <Image
        src={imgLink}
        alt="Background"
        layout="fill"
        objectFit="cover"
        quality={100}
        className="absolute inset-0 w-full h-[250px] bg-center bg-cover blur-[4px]"
      />
      {/* </div> */}

      {/* 文字内容 */}
      <div className="relative w-full h-[250px] m-0 bg-black bg-opacity-50 flex justify-center items-center">
        <div className="w-full max-w-[700px] my-0 mx-auto pt-[30px] pb-[20px] py-[25px] animate-fadeIn">
          <h1 className="text-[21px] font-bold text-white">{title}</h1>
          {/* 日期、分类和评论信息 */}
          <div className="text-[12px] text-white">
            Published on {date} in <span>{category}</span> with {comments}{" "}
            comment{comments !== 1 ? "s" : ""}
          </div>
          {/* 标签 */}
          <div className="flex border-b-0 m-0 pt-[5px] px-0 pb-[15px]">
            {tags.map((tag, index) => (
              <a
                key={index}
                href={"/tag/" + tag}
                className="border-none text-[12px] font-medium inline-block m-[4px_8px_0_0] px-[15px] transition duration-[400ms] tracking-[0] text-[#5f5f5f] rounded-[20px] outline-none bg-white"
              >
                # {tag}
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ArticleHeader;
