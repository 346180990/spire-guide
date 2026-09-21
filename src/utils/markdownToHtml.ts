import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import rehypeSanitize from "rehype-sanitize";
import rehypeHighlight from "rehype-highlight";

export default async function markdownToHtml(
  markdown: string,
): Promise<string> {
  const file = await unified()
    .use(remarkParse) // 解析 Markdown
    .use(remarkRehype) // 转换为 HTML
    .use(rehypeSanitize) // 安全过滤
    .use(rehypeHighlight) // 代码高亮
    .use(rehypeStringify) // 转换为字符串
    .process(markdown);

  return String(file);
}
