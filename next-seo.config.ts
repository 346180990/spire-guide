import { DefaultSeoProps } from "next-seo";
import { Config } from "./src/config"

// <DefaultSeo
// title={Config.SITE_NAME}
// description={Config.SITE_DESCRIPTION}
// canonical={Config.SITE_URL}
// openGraph={{
//   type: "website",
//   locale: "zh_CN",
//   url: Config.SITE_URL,
//   title: Config.SITE_NAME,
//   description: Config.SITE_DESCRIPTION,
//   images: [
//     {
//       url: Config.SITE_URL + Config.SITE_IMAGE,
//       width: 600,
//       height: 600,
//       alt: Config.SITE_NAME,
//     },
//   ],
//   site_name: Config.SITE_NAME,
// }}

const SEO: DefaultSeoProps = {
    title: Config.SITE_NAME,
    description: Config.SITE_DESCRIPTION,
    canonical: Config.SITE_URL,
    openGraph: {
        type: "website",
        locale: "zh_CN",
        url: Config.SITE_URL,
        title: Config.SITE_NAME,
        description: Config.SITE_DESCRIPTION,
        site_name: Config.SITE_NAME,
        images: [
            {
                url: Config.SITE_URL + Config.SITE_IMAGE,
                width: 600,
                height: 600,
                alt: Config.SITE_NAME,
            },
        ],
    },
    additionalLinkTags: [
        {
            rel: "alternate",
            type: "application/rss+xml",
            href: "/rss.xml",
        },
        {
            rel: "icon",
            href: "/favicon.ico",
        },
    ],
};

export default SEO;
