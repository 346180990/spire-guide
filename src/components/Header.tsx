import React from "react";
import { useEffect, useRef } from "react";
import Link from "next/link";
import Headroom from "headroom.js";
import { Config } from "@/config";

const Header = () => {
  const headerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (headerRef.current) {
      const headroom = new Headroom(headerRef.current, {
        offset: 70, // 滚动多少距离后开始触发
        tolerance: 0, // 忽略小幅滚动
        classes: {
          initial: "animated", // 初始化类名
          pinned: "animate-slideDown", // 显示时的类名
          unpinned: "animate-slideUp", // 隐藏时的类名
        },
      });
      headroom.init();
      return () => headroom.destroy(); // 清理
    }
  }, []);

  const navItems = [
    ...Config.SITE_CATEGORIES.map((category) => ({
      label: category,
      href: `/category/${category}`,
    })),
    { label: "关于", href: "/about" },
    { label: "友链", href: "/links" },
  ];

  return (
    <header
      ref={headerRef}
      className="bg-white shadow-md flex justify-center w-[100%] z-10 text-right fixed"
    >
      <div className="w-[1040px] max-w-full h-[70px] flex justify-between  items-center relative whitespace-nowrap">
        {/* 左侧标题 */}
        <Link href="/">
          <div className="block text-[22px] leading-[22px] ml-[25px] left-0">
            {Config.SITE_NAME}
          </div>
        </Link>
        <div className="flex items-center">
          {/* 中间导航菜单 */}
          <nav className="text-[14px] pr-[5px] hidden sm:inline-block">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className="px-[15px]">
                {item.label}
              </Link>
            ))}
          </nav>

          {/* 右侧搜索图标 */}
          <div className="flex leading-[70px] w-10 h-10 px-0 pr-5 cursor-pointer items-center justify-center text-right group">
            {/* <div className="z-[1] w-[50px] h-[50px] mt-[2px] mr-0 mb-0 ml-[3px] rotate-[-45deg] text-gray-800 border-2 border-solid border-current rounded-full"> */}
            <div className="z-[1] w-[13px] h-[13px] mt-[2px] mr-0 mb-1 ml-[1px] rotate-[-45deg]  text-gray-800 border-2 border-solid border-current rounded-full relative group-hover:text-[#eb5055] group-active:text-[#eb5055] group-focus:text-[#eb5055]">
              <div className="absolute top-[11px] left-[3px] w-0.5 h-1 bg-current"></div>
            </div>
            <form
              id="search"
              method="post"
              action="/"
              role="search"
              className="absolute leading-[30px] top1/2 right-0 block  h-[30px] pr-[10px] w-[150px] sm:w-auto mr-[55px] sm:mr-0 max-w-[60%] my-sr-only  group-hover:not-my-sr-only group-active:not-my-sr-only group-focus:not-my-sr-only"
            >
              <span className="leading-[30px] relative inline-block w-[400px] h-[30px] max-w-[100%] rounded-[3px]">
                <input
                  type="text"
                  id="input"
                  className="text-[14px] leading-[30px] absolute top-0 left-0 w-[100%] h-[30px] py-0 pr-[40px] pl-[18px] text-[#313131] border border-[#eb5055] rounded-[20px] bg-white outline-none "
                  name="s"
                  placeholder="Search..."
                />
              </span>
            </form>
          </div>

          {/* 导航栏按钮 */}
          <nav className="leading-[70px] z-1 inline-block sm:hidden w-[28px] py-0 pr-[45px] pl-[10px] cursor-pointer group">
            <span
              className="relative inline-block w-[20px] h-[12px] transition-all duration-400 ease-in-out custom-cubic 
                            group-hover:transform group-hover:rotate-[360deg]
                            group-focus:transform group-focus:rotate-[360deg]
                            group-active:transform group-active:rotate-[360deg]
                            "
            >
              <span className="absolute top-0 left-[-.25em] inline-block w-[20px] h-[2px]  transition-all duration-400 ease-in-out origin-center bg-[#313131] group-hover:nav-mobile-menu-close-left group-focus:nav-mobile-menu-close-left group-active:nav-mobile-menu-close-left"></span>
              <span className="absolute top-[50%] left-[-.25em] inline-block w-[20px] h-[2px] mt-[-1px] transition-all duration-400 ease-in-out bg-[#313131] group-hover:opacity-0 group-focus:opacity-0 group-active:opacity-0"></span>
              <span className="absolute bottom-0 left-[-.25em] inline-block w-[20px] h-[2px]  transition-all duration-400 ease-in-out origin-center bg-[#313131] group-hover:nav-mobile-menu-close-right group-focus:nav-mobile-menu-close-right group-active:nav-mobile-menu-close-right"></span>
            </span>
            <ul className="absolute z-1 top-[100%] my-sr-only group-hover:not-my-sr-only-ul group-active:not-my-sr-only-ul group-focus:not-my-sr-only-ul my-0 mr-0 ml-[-95px] px-0 py-0 transition-transform duration-300 transform translate-x-30 indent-0 ">
              {navItems.map((item) => (
                <li
                  key={item.href}
                  className="relative inline mx-0 my-0 no-underline"
                >
                  <Link
                    href={item.href}
                    className="text-[15px] leading-[2.2] block w-[140px] m-0 py-[8px] px-[25px] bg-white"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Header;
