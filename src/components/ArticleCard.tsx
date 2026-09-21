import Image from "next/image";
import Link from "next/link";
import React, { useState, useEffect } from "react";

interface ArticleCardProps {
  title: string;
  date: string;
  category: string;
  image: string;
  description: string;
  id: string;
}

const ArticleCard: React.FC<ArticleCardProps> = ({
  title,
  date,
  category,
  image,
  description,
  id,
}) => {
  const [randomNumber, setRandomNumber] = useState(0);

  useEffect(() => {
    const number = Math.floor(Math.random() * 10);
    setRandomNumber(number);
  }, [id]); // trigger 作为依赖项

  return (
    <div className="relative w-full p-0 rounded overflow-hidden shadow bg-white group hover:shadow-md">
      {/* 图片部分 */}
      <div
        className="relative min-h-[250px] w-full transition-transform transition-filter duration-500 ease bg-center bg-cover
      group-hover:scale-110 group-hover:blur-sm
      "
      >
        {image ? (
          <Image
            src={image}
            alt={title}
            layout="fill"
            objectFit="cover"
            className="rounded"
            priority
            unoptimized
          />
        ) : (
          // 文章未设置首图时的兜底封面
          <div
            aria-hidden="true"
            className="absolute inset-0 h-full w-full bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900"
          >
            <div className="absolute top-0 right-0 h-[120px] w-[120px] rounded-full bg-white/5"></div>
            <div className="absolute bottom-[70px] left-[20px] h-[60px] w-[60px] rounded-full bg-white/5"></div>
            <span className="absolute top-[88px] left-[24px] text-[13px] tracking-[0.3em] text-white/60">
              {category}
            </span>
          </div>
        )}
      </div>
      <Link href={`/${id}`}>
        <div
          className="absolute top-0 overflow-hidden w-full h-full py-[40px] px-[28px]
          group-hover:bg-black group-hover:bg-opacity-50"
        >
          <p
            className="text-[14px] m-0 p-0 break-all opacity-0 text-white
            group-hover:animate-fade-in group-hover:duration-500 group-hover:opacity-100
          "
          >
            {description}
          </p>
        </div>
      </Link>
      {/* <div className="absolute z-0 right-0 bottom-[50px] left-0 w-[110%] min-h-[100px] bg-black bg-opacity-50 rotate-[-10deg]  -translate-y-[10px] opacity-[.7] shadow-none"></div> */}
      <div className="absolute z-10 right-0 bottom-[50px] left-0  w-[110%]  min-h-[100px] bg-black bg-opacity-50 rotate-[-10deg] -translate-y-[10px] opacity-[.7] shadow-none item-slant reverse-slant"></div>
      <div className="absolute z-0 right-0 bottom-[50px] left-0 w-[110%] min-h-[100px] bg-white rotate-[7deg] -translate-x-[10px] item-slant"></div>

      {/* 文字部分 */}
      <div className="relative h-[130px] bg-white pt-[10px] pb-[40px] px-[20px]">
        <Link href={`/${id}`} className="text-[17px] leading-[17px] break-all">
          {title}
        </Link>
        <div className="absolute right-0 bottom-0 w-[100%] px-[15px] pt-0 pb-[15px] text-right">
          <div className="relative float-left text-[12px] pt-[11px] pl-[9px] text-right normal-case text-[#5f5f5f]">
            <time dateTime={`${date}`} itemProp="datePublished">
              {date}
            </time>
          </div>

          <div
            className="bg-article-icon bg-no-repeat bg-custom inline-block float-right w-[42px] h-[42px] border border-gray-200 border-solid rounded-full"
            style={{ backgroundPosition: `0px -${randomNumber * 40}px` }}
          ></div>

          <div>
            <Link
              href={`/category/${category}`}
              className="text-[13px] relative float-right mr-[10px] py-[10px] px-0 text-right normal-case"
            >
              {" "}
              {category}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ArticleCard;
