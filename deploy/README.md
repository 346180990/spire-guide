# 部署到国内轻量 VPS（最省心的方案）

目标：一台 **2 核 2G** 的轻量服务器，公网 `http://IP:8090/?token=…`，每天 08:45 / 18:00 自动算一次并推微信。

为什么选它：这个服务是「零依赖 Node 单进程 + 本地磁盘缓存 + 常驻定时器 + 出站拉国内行情」，
正好是 VPS 最擅长的形态。PaaS（Render / Railway / Vercel）要么免费档休眠、要么没有持久盘、
要么跑不了常驻定时任务，反而更麻烦。

| 项目 | 建议 |
|---|---|
| 配置 | 2 核 2G / 2~3M 带宽 / 40G 系统盘（**再小也够**：Node 常驻约 60MB，`web/data` 现在只有 4.3MB） |
| 系统 | Ubuntu 24.04 LTS（apt 自带 Node 18.19，直接满足 `engines: >=18`） |
| 价格 | 阿里云「经济型 e / 轻量」2核2G3M ≈ 99 元/年（新用户，续费同价档）；腾讯云轻量入门型 2核2G 同配置列表价 40 元/月，等活动价即可 |
| 备案 | **用 IP:8090 访问不需要备案**；只有绑域名 + 80/443 时才需要 ICP 备案 |

> 脚本已兼容的镜像：Ubuntu / Debian（apt）、OpenCloudOS / Rocky / CentOS Stream（dnf）、
> 以及已自带 Node 的应用镜像。三个容易翻车的点已经自动处理：
> ① 系统里没 `curl`/`xz` 会按发行版补装；② RHEL 系 `firewalld` 会自动放行 `SA_PORT`；
> ③ node 装在 `/root/.nvm` 时会复制到 `/opt/node`（unit 里 `ProtectHome=true` 读不到家目录）。
> SELinux 处于 `Enforcing` 时脚本会提示怎么验证。

---

## 一、买机 + 放行端口

1. 买 2 核 2G 的轻量应用服务器，系统选 **Ubuntu 24.04**，地域选离你近的（华东/华北）。
2. 记下公网 IP，在控制台「防火墙 / 安全组」放行：
   - `22`（SSH）
   - `8090`（这个服务）
3. 本地生成密钥并登一次，确认免密可用：

```powershell
ssh-keygen -t ed25519           # 一路回车（已有就跳过）
type $env:USERPROFILE\.ssh\id_ed25519.pub    # 复制这一行
```

把它贴到服务器 `~/.ssh/authorized_keys`（或买机时直接选密钥对），然后：

```powershell
ssh root@<公网IP> "echo ok"
```

---

## 二、上传代码

在**仓库根目录**（`D:\project\simplejiaoyi`）执行：

```powershell
powershell -File deploy\deploy.ps1 -Server <公网IP> -FirstTime
```

第一次带 `-FirstTime`，它会：打包 → scp → 解包到 `/opt/simplejiaoyi` → 跑 `bootstrap.sh`
（装 Node / 建 `strategy` 用户 / 装 systemd / 生成令牌 / 启动）。

首次运行会打印类似：

```
已生成 /etc/strategy-web.env，令牌: 3f9c…（32 位）
✅ 服务已启动: active
```

> 只传 `web/`、`strategy-miniprogram/core/`、`strategy-miniprogram/cloudfunctions/market-bars/`、`deploy/`。
> 少了 `cloudfunctions/market-bars` 服务照样能起，但**永远拉不到行情**（会静默回退到内置样例）——
> 这个目录就是东财/腾讯的抓取实现。
> `web/data`（行情缓存 / 回测记录 / state.json / config.json）**不会被覆盖**，升级也安全。

如果这台机器不是 root 登录（比如腾讯云 Ubuntu 镜像默认 `ubuntu` 用户）：

```powershell
powershell -File deploy\deploy.ps1 -Server <IP> -User ubuntu -FirstTime
```

`bootstrap.sh` 里需要 root 权限，`ubuntu` 用户请先 `sudo` 一次：
`ssh ubuntu@IP "sudo bash /opt/simplejiaoyi/deploy/bootstrap.sh"`。

---

## 三、验证

```powershell
# 服务器本机
ssh root@<IP> "curl -s http://127.0.0.1:8090/api/health | head -c 300"

# 看日志
ssh root@<IP> "journalctl -u strategy-web -n 50 --no-pager"
```

浏览器打开：`http://<IP>:8090/?token=<bootstrap 打印的令牌>`

页面应该显示：结论「观望/持有/买入」、数据截至最近交易日、标的明细。
第一次打开如果没有缓存，服务端会去拉腾讯/东财行情，慢几秒是正常的。

顺手确认三件事：

1. 右上角状态不是「失败」；
2. 点「立即跑一次」，`每日计算` 卡片里多一条流水（说明定时任务的代码路径也通）；
3. `systemctl status strategy-web` 是 `active (running)`，且 `Restart=always` 已生效（`kill` 掉进程会在 3 秒内自己起来）。

---

## 四、日常操作

| 想做什么 | 命令 |
|---|---|
| 改端口 / 令牌 / 推送 key | 编辑 `/etc/strategy-web.env` → `systemctl restart strategy-web` |
| 看实时日志 | `journalctl -u strategy-web -f` |
| 升级代码（本地改完） | `powershell -File deploy\deploy.ps1 -Server <IP>`（不带 `-FirstTime`，只重启） |
| 备份数据 | `ssh root@<IP> "tar czf /tmp/data.tgz -C /opt/simplejiaoyi web/data"` 然后 `scp root@<IP>:/tmp/data.tgz .` |
| 重启 / 停止 | `systemctl restart strategy-web` / `systemctl stop strategy-web` |

需要备份的只有 `web/data/`：`runs/`（回测记录）、`bars/`（行情缓存，丢了会自动重抓）、
`state.json`（上次结论，丢了最多导致下次重复推送一次）。

---

## 五、想绑域名 + HTTPS（可选）

国内服务器绑域名要先 **ICP 备案**，否则 80/443 会被拦。备好了再：

```bash
apt install -y caddy
cp /opt/simplejiaoyi/deploy/Caddyfile.example /etc/caddy/Caddyfile   # 改域名 + 密码哈希
caddy hash-password --plaintext '你的密码'                            # 生成 basic_auth 哈希
systemctl reload caddy
```

> **⚠ 必须加 basic_auth**：`server.mjs` 的鉴权是「来源 IP 是本机就免令牌」，
> 套上反代后所有请求都来自 `127.0.0.1`，`SA_TOKEN` 会被绕过。
> 不绑域名就没这个问题——直接用 `http://IP:8090/?token=…`。

---

## 六、几个已经踩过的坑

1. **别用 Render / Railway 免费档**：15 分钟无访问就休眠，定时任务直接不跑；且免费档没有持久盘，
   回测记录每次部署就没了。Vercel/Netlify 是静态 + 函数，跑不了常驻定时器。
2. **`SA_HOST` 必须是 `0.0.0.0`**，默认是 `127.0.0.1`（只监听本机，公网打不开）。
3. **`SA_TOKEN` 必须设**。监听 `0.0.0.0` 又不设令牌 = 把回测接口开放给全网。
4. **云厂商的防火墙是独立的一层**：机器上 `ufw` 放行了不代表能访问，控制台安全组也要放行 8090。
5. 服务器时区不用管：定时调度内部按 `Intl` 的 `Asia/Shanghai` 算，UTC 机器也准。
6. 断网/数据源抽风不会挂：拉不到行情就用本地缓存或内置样例，页面会标「缓存数据 / 内置样例」。
7. 续费：99 元档多为「首年/续费同价」，买之前确认一下续费价，别到时候变 40 元/月。
8. **令牌要传进 `/api` 请求**：`?token=` 只作用于地址栏那次请求，页面里的 `fetch` 是另外发的。
   现在的实现是「首页带 `?token=` 打开 → 响应里种 `sa_token` cookie（HttpOnly）→ 之后同源请求自动带上」，
   也支持 `x-sa-token` 头。**如果页面能开但到处是「需要访问令牌 / 失败」，就是这一环没打通**，
   刷新一次让 cookie 落地即可。
