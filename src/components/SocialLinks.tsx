import React from "react";
import { Config } from "@/config";

const SocialLinks: React.FC = () => {
  return (
    <div
      className="w-full border-b  border-custom-rgba border-solid  py-5 flex justify-center  items-center text-[13px] text-[#5f5f5f] 
        max-[650px]:hidden"
    >
      <a
        href={Config.SITE_URL + "/rss.xml"}
        target="_blank"
        rel="noopener noreferrer"
        className=" px-[25px] text-[#5f5f5f] text-[13px] font-sans
                hover:text-red-500"
      >
        RSS
      </a>
      <a
        href={Config.SITE_GITHUB}
        target="_blank"
        rel="noopener noreferrer"
        className="px-[25px] text-[#5f5f5f] text-[13px] font-sans
                hover:text-red-500"
      >
        GITHUB
      </a>
    </div>
  );
};

export default SocialLinks;
