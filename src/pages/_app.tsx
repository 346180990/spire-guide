import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { DefaultSeo } from "next-seo";
import SEO from "../../next-seo.config";

// 注：GA4 / AdSense 脚本在 src/pages/_document.tsx 中直接写入 HTML head，
// 以保证静态导出后脚本存在于 HTML（AdSense 站点校验需要）。

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <DefaultSeo {...SEO} />
      <Component {...pageProps} />
    </>
  );
}
