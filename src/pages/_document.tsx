import { Html, Head, Main, NextScript } from "next/document";
import { Config } from "@/config";

export default function Document() {
  return (
    <Html lang="zh-CN">
      <Head>
        <link rel="icon" href="/favicon.ico" />

        {/* Google Analytics 4（复用 spire-guide 的 GA4 资源）
            静态导出下写入 HTML，避免依赖客户端 hydration */}
        {Config.GA_MEASUREMENT_ID ? (
          <>
            <script
              async
              src={`https://www.googletagmanager.com/gtag/js?id=${Config.GA_MEASUREMENT_ID}`}
            />
            <script
              dangerouslySetInnerHTML={{
                __html: `window.dataLayer = window.dataLayer || [];
function gtag(){window.dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${Config.GA_MEASUREMENT_ID}');`,
              }}
            />
          </>
        ) : null}

        {/* Google AdSense（复用 spire-guide 的 AdSense 资源） */}
        {Config.ADSENSE_PUBLISHER_ID ? (
          <script
            async
            crossOrigin="anonymous"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${Config.ADSENSE_PUBLISHER_ID}`}
          />
        ) : null}
      </Head>
      <body className="antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
