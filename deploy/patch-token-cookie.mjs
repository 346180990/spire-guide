/**
 * 给 server.mjs 打补丁：支持 cookie 鉴权（页面带 ?token= 打开时种 cookie，
 * 之后浏览器同源 fetch 自动带上；这样前端就算没把 token 塞进请求也能用）。
 *
 * 用法: node patch-token-cookie.mjs <server.mjs 路径>
 */
import { readFileSync, writeFileSync } from 'node:fs';

const p = process.argv[2];
let s = readFileSync(p, 'utf8');
const before = s;

if (!s.includes('tokenFromCookie')) {
  s = s.replace('function checkAuth(req, url) {', `function tokenFromCookie(req) {
  const raw = req.headers.cookie || '';
  const m = raw.match(/(?:^|;\\s*)sa_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

function checkAuth(req, url) {`);
  s = s.replace("const t = url.searchParams.get('token') || req.headers['x-sa-token'];",
    "const t = url.searchParams.get('token') || req.headers['x-sa-token'] || tokenFromCookie(req);");
}

if (!s.includes('Set-Cookie')) {
  const line = "  res.writeHead(200, {\n    'Content-Type': type,";
  if (!s.includes(line)) throw new Error('找不到静态响应头锚点');
  s = s.replace(line, `  const cookie = CONFIG.accessToken && url.searchParams.get('token') === CONFIG.accessToken
    ? { 'Set-Cookie': 'sa_token=' + encodeURIComponent(CONFIG.accessToken) + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000' }
    : {};
  res.writeHead(200, {
    ...cookie,
    'Content-Type': type,`);

  const spaLine = "      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Content-Length': buf.length });";
  if (s.includes(spaLine)) {
    s = s.replace(spaLine, `      const spaCookie = CONFIG.accessToken && url.searchParams.get('token') === CONFIG.accessToken
        ? { 'Set-Cookie': 'sa_token=' + encodeURIComponent(CONFIG.accessToken) + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000' }
        : {};
      res.writeHead(200, { ...spaCookie, 'Content-Type': MIME['.html'], 'Content-Length': buf.length });`);
  }
}

writeFileSync(p, s);
console.log(p, '| changed=' + (s !== before), '| helper=' + s.includes('tokenFromCookie'), '| cookie=' + s.includes('Set-Cookie'));
