import React, { useEffect, useRef } from "react";
import mermaid from "mermaid";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
// import remarkMath from "remark-math";
// import rehypeMathjax from "rehype-mathjax"
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeHighlight from "rehype-highlight";
import remarkEmoji from "remark-emoji";

// import SyntaxHighlighter from 'react-syntax-highlighter';
// import SyntaxHighlighter from 'react-syntax-highlighter';
// import {Prism as SyntaxHighlighter} from 'react-syntax-highlighter'
// import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
// import  github  from "react-syntax-highlighter/dist/esm/styles/hljs"; // 引入 GitHub 主题
// import { CodeProps } from "react-markdown/lib/ast-to-react";
import "katex/dist/katex.min.css"; // 确保引入 KaTeX 样式
import "highlight.js/styles/github.css"; // 选择合适的样式

interface ArticleProps {
  content: string;
}

const Article: React.FC<ArticleProps> = ({ content }) => {
  const articleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const headers = articleRef.current?.querySelectorAll("h1, h2, h3") || [];
    headers.forEach((header) => {
      const id = header.textContent?.replace(/\s+/g, "-").toLowerCase() || "";
      if (header && id) header.id = id;
    });

    mermaid.initialize({ startOnLoad: true });
    mermaid.run();
  }, []);

  return (
    // <div ref={articleRef} className="prose prose-lg mx-auto">
    //   {/* <ReactMarkdown>{content}</ReactMarkdown> */}

    // </div>
    <div>
      {/* 引入 KaTeX CSS */}
      {/* <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.0/dist/katex.min.css" /> */}
      {/* 引入代码高亮 CSS */}
      {/* <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism-themes/1.9.0/prism-tomorrow.min.css" /> */}

      {/* <div dangerouslySetInnerHTML={{ __html: content }} /> */}
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm, remarkEmoji]}
        rehypePlugins={[rehypeKatex, rehypeRaw, rehypeSlug, rehypeHighlight]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            if (
              match?.[1] === "mermaid" ||
              match?.[1] === "flow" ||
              match?.[1] === "seq"
            ) {
              return <div className="mermaid">{children}</div>;
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default Article;
