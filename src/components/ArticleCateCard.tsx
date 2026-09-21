import Link from "next/link";
import React, { useState, useEffect } from "react";

interface ArticleCateCardProps {
  title: string;
  date: string;
  category: string;
  image: string;
  description: string;
  id: string;
}

const ArticleCateCard: React.FC<ArticleCateCardProps> = ({
  title,
  date,
  id,
}) => {
  const [randomNumber, setRandomNumber] = useState(0);

  useEffect(() => {
    const number = Math.floor(Math.random() * 10);
    setRandomNumber(number);
  }, [id]);

  return (
    <Link href={`/${id}`} className="m-0 p-[15px]">
      <div
        className="w-full bg-white border-r-[3px] shadow-sm border transform transition duration-300 
            hover:scale-105 hover:shadow-md"
      >
        <div className="bg-white h-[130px] pt-[25px] px-[20px] flex flex-col justify-between">
          <h2 className="font-sans text-[14px] leading-[1.8] text-[#313131] [text-rendering:geometricPrecision]">
            {title}
          </h2>
          <div className="flex justify-between">
            <p className="text-sm text-gray-500 mt-2">{date}</p>
            <div
              className="bg-article-icon bg-no-repeat bg-custom inline-block float-right w-[42px] h-[42px] border border-gray-200 border-solid rounded-full"
              style={{ backgroundPosition: `0px -${randomNumber * 40}px` }}
            ></div>
          </div>
        </div>
      </div>
    </Link>
  );
};

export default ArticleCateCard;
