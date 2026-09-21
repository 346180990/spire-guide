import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import { parse } from "yaml";
import { visit } from "unist-util-visit";
import { Config } from "../config"

const postsDirectory = path.join(process.cwd(), "posts");

export interface FullSiteInfo {
  siteName?: string; // 站点名称
  copyright?: string;
  postsInfo?: {
    id: string;
    post: ParsedMarkdown;
  }; //文章数据
  categories: [];
  recentPosts: [ParsedMarkdown];
  hotTags: [string];
}

export interface ParsedMarkdown {
  id?: string;
  title?: string;
  description?: string;
  category?: string;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
  headings: { level: number; text: string }[];
  firstImage?: string;
  contentHTML?: string;
  visitNum?: number;
}

function parseMarkdown(id: string): ParsedMarkdown {
  const filePath = path.join(postsDirectory, `${id}.md`);
  const fileContent = fs.readFileSync(filePath, "utf-8");

  const parsedData: ParsedMarkdown = {
    id: id,
    headings: [],
  };

  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, { type: "yaml", marker: "-" });

  const tree = processor.parse(fileContent);

  // Extract YAML frontmatter and headings
  visit(tree, (node) => {
    if (node.type === "yaml") {
      const yamlContent = node.value as string;

      const frontmatter = parse(yamlContent) as ParsedMarkdown;
      parsedData.title = frontmatter.title as string | undefined;
      parsedData.description = frontmatter.description as string | undefined;
      parsedData.category = frontmatter.category as string | undefined;
      parsedData.tags = frontmatter.tags as string[] | undefined;
      parsedData.createdAt = frontmatter.createdAt as string | undefined;
      parsedData.updatedAt = frontmatter.updatedAt as string | undefined;
    }

    if (node.type === "heading") {
      const level = node.depth;
      const text = node.children
        .filter((child) => child.type === "text")
        .map((child) => child.value)
        .join("");
      parsedData.headings.push({ level, text });
    }

    if (node.type === "image" && !parsedData.firstImage) {
      parsedData.firstImage = node.url;
    }
  });

  return parsedData;
}

// function parseYaml(yaml: string): Record<string, string | string[] | undefined> {
//   const lines = yaml.split('\n');
//   const result: Record<string, string | string[] | undefined> = {};
//   for (const line of lines) {
//     console.log(line)
//     const [key, value] = line.split(':').map((part) => part.trim());
//     console.log(key, value)
//     if (key && value) {
//       result[key] = value.replace(/^['"]|['"]$/g, ''); // Remove quotes
//     }
//   }
//   return result;
// }

function buildPostData(id: string) {
  const fullPath = path.join(postsDirectory, `${id}.md`);
  const fileContents = fs.readFileSync(fullPath, "utf8");

  // Use gray-matter to parse the post metadata section
  const matterResult = matter(fileContents);
  const parsedData = parseMarkdown(id);

  // Use remark to convert markdown into HTML string
  // const processedContent = remark()
  // .use(remarkGfm) // 支持删除线
  //   .use(remarkBreaks) // 处理换行和反斜杠
  //   .use(remarkRehype, { allowDangerousHtml: true }) // 允许 HTML
  //   .use(rehypeRaw) // 解析 HTML
  //   .use(rehypeAutolinkHeadings, { behavior: 'wrap' }) // 生成标题锚点
  //   .use(rehypeStringify) // 转换为 HTML
  //   .processSync(matterResult.content)
  // const contentHtml = processedContent.toString()

  // parsedData.contentHTML = contentHtml;
  parsedData.contentHTML = matterResult.content;

  // Combine the data with the id and contentHtml
  return parsedData;
}

function buildAllPostData() {
  const fileNames = fs.readdirSync(postsDirectory);
  const allPostsData = new Map(
    fileNames.map((fileName) => {
      // Remove ".md" from file name to get id
      const id = fileName.replace(/\.md$/, "");
      const parsedData = buildPostData(id);

      return [id, parsedData];
    }),
  );
  return allPostsData;
}
const allPostsData = buildAllPostData();

export function getPostData(id: string) {
  return allPostsData.get(id);
}

export function getPostDataByCate(category: string) {
  return Array.from(allPostsData.values()).filter(
    (p) => p.category === category,
  );
}

export function getPostDataByTag(tag: string) {
  return Array.from(allPostsData.values()).filter((p) =>
    (p.tags || []).includes(tag),
  );
}

export function getSortedPostsData() {
  return Array.from(allPostsData.values()).sort((a, b) => {
    if ((a.createdAt || "") < (b.createdAt || "")) {
      return 1;
    } else {
      return -1;
    }
  });
}

export function getAllPostIds() {
  return Array.from(allPostsData.keys());
}

export function getAllPostTitles() {
  return Array.from(
    new Set(Array.from(allPostsData.values()).map((p) => p.title || "")),
  );
}

export function getAllPostTypeSet() {
  return Array.from(
    new Set(Array.from(allPostsData.values()).map((p) => p.category || "")),
  );
}

export function getAllPostTagSet() {
  return Array.from(
    new Set(Array.from(allPostsData.values()).flatMap((p) => p.tags || [])),
  );
}

export function getRecentPosts(num: number) {
  if (num <= 0) {
    return [];
  }
  return getSortedPostsData().slice(0, num);
}

export function getRecentPostsTitleAndLink() {
  const posts = getRecentPosts(Config.RECENT_POSTS_NUM)
  return posts.map(({title, id}) => ({title, id}))
}