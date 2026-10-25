#!/usr/bin/env bash
#
# 一次性初始化国内轻量 VPS：装 Node（>=18）+ 建运行用户 + 装 systemd 服务
#
# 用法（在服务器上，root）：
#   1) 先把代码传到 /opt/simplejiaoyi（Windows 侧跑 deploy\deploy.ps1）
#   2) bash /opt/simplejiaoyi/deploy/bootstrap.sh
#
set -euo pipefail

APP_DIR=/opt/simplejiaoyi
SVC_USER=strategy
SVC_NAME=strategy-web
ENV_FILE=/etc/${SVC_NAME}.env
NODE_DIR=/opt/node

[[ $EUID -eq 0 ]] || { echo "请用 root 运行（sudo -i 后重试）"; exit 1; }
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "== 1/5 找 Node（>=18）"

# 非交互 SSH 的 PATH 里没有 nvm，所以除了 command -v 还要去 ~/.nvm 里找
find_node() {
  local c
  c="$(command -v node 2>/dev/null || true)"
  if [[ -z "$c" ]]; then
    c="$(ls -d /root/.nvm/versions/node/*/bin/node 2>/dev/null | sort -V | tail -1 || true)"
  fi
  if [[ -z "$c" ]]; then
    c="$(ls -d /home/*/.nvm/versions/node/*/bin/node 2>/dev/null | sort -V | tail -1 || true)"
  fi
  [[ -n "$c" ]] || return 1
  readlink -f "$c"
}

NODE_BIN="$(find_node || true)"
NODE_MAJOR=0
if [[ -n "$NODE_BIN" ]]; then
  NODE_MAJOR="$("$NODE_BIN" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
fi

if [[ "$NODE_MAJOR" -ge 18 ]]; then
  echo "   用已有的 $("$NODE_BIN" -v)（$NODE_BIN）"
else
  echo "   没找到 Node 18+，下载 v22 ..."
  # 极简镜像可能没有 curl / xz，按发行版补装
  MISSING=""
  command -v curl >/dev/null 2>&1 || MISSING="$MISSING curl"
  XZ_PKG=xz
  if command -v apt-get >/dev/null 2>&1; then XZ_PKG=xz-utils; fi
  command -v xz >/dev/null 2>&1 || MISSING="$MISSING $XZ_PKG"
  if [[ -n "$MISSING" ]]; then
    echo "   补装依赖:$MISSING"
    if command -v apt-get >/dev/null 2>&1; then
      apt-get update -qq
      # shellcheck disable=SC2086
      apt-get install -y $MISSING
    elif command -v dnf >/dev/null 2>&1; then
      # shellcheck disable=SC2086
      dnf install -y $MISSING
    elif command -v yum >/dev/null 2>&1; then
      # shellcheck disable=SC2086
      yum install -y $MISSING
    fi
  fi

  arch="$(uname -m)"
  case "$arch" in
    x86_64)          ARCH=x64 ;;
    aarch64|arm64)   ARCH=arm64 ;;
    *) echo "   不支持的架构: $arch（请手动装 Node 18+）"; exit 1 ;;
  esac

  # 国内优先用 npmmirror，失败再回源 nodejs.org
  NAME=""
  for BASE in https://npmmirror.com/mirrors/node https://nodejs.org/dist; do
    NAME="$(curl -fsSL "$BASE/latest-v22.x/SHASUMS256.txt" 2>/dev/null \
            | grep -o "node-v22\.[0-9.]*-linux-${ARCH}\.tar\.xz" | head -1 || true)"
    [[ -n "$NAME" ]] || continue
    TMP="$(mktemp -d)"
    if curl -fsSL -o "$TMP/node.tar.xz" "$BASE/latest-v22.x/$NAME"; then
      mkdir -p "$NODE_DIR"
      tar -xJf "$TMP/node.tar.xz" -C "$NODE_DIR" --strip-components=1
      rm -rf "$TMP"
      ln -sf "$NODE_DIR/bin/node" /usr/local/bin/node
      ln -sf "$NODE_DIR/bin/npm"  /usr/local/bin/npm
      break
    fi
    rm -rf "$TMP"
    NAME=""
  done
  [[ -n "$NAME" ]] || { echo "   Node 下载失败，请手动安装 Node 18+ 后重跑"; exit 1; }
  NODE_BIN="$NODE_DIR/bin/node"
fi

# systemd 统一走 /usr/local/bin/node：
#   - 系统级安装的在 /usr/bin，软链过去即可
#   - nvm / 家目录里的，service 用户读不到（unit 里 ProtectHome=true），复制到 /opt/node
#     只复制可执行文件本身：nvm 的 prefix 里往往还有全局包（几百 MB～GB），运行时不缺那些
case "$NODE_BIN" in
  /root/*|/home/*)
    echo "   node 在家目录（$NODE_BIN），复制可执行文件到 $NODE_DIR/bin/node"
    mkdir -p "$NODE_DIR/bin"
    cp -a "$NODE_BIN" "$NODE_DIR/bin/node"
    chmod 755 "$NODE_DIR/bin/node"
    NODE_BIN="$NODE_DIR/bin/node"
    ;;
esac

ln -sf "$NODE_BIN" /usr/local/bin/node
echo "   systemd 将使用 /usr/local/bin/node -> $(readlink -f /usr/local/bin/node 2>/dev/null || echo '?')"

echo "== 2/5 建运行用户"
if ! id -u "$SVC_USER" >/dev/null 2>&1; then
  useradd -r -m -d "/home/${SVC_USER}" -s /usr/sbin/nologin "$SVC_USER"
  echo "   已创建用户 $SVC_USER"
else
  echo "   用户 $SVC_USER 已存在"
fi

echo "== 3/5 准备目录"
mkdir -p "${APP_DIR}/web/data"
chown -R "${SVC_USER}:${SVC_USER}" "$APP_DIR"
# 从 Windows 打的包会带 777/666，收紧成「属主可写、其他人只读」
chmod -R go-w "$APP_DIR"
find "$APP_DIR" -type d -exec chmod 755 {} \;
echo "   $APP_DIR 归 $SVC_USER 所有"

echo "== 4/5 装 systemd 服务"
install -m 644 "${HERE}/${SVC_NAME}.service" "/etc/systemd/system/${SVC_NAME}.service"
if [[ ! -f "$ENV_FILE" ]]; then
  install -m 600 "${HERE}/${SVC_NAME}.env.example" "$ENV_FILE"
  if command -v openssl >/dev/null 2>&1; then
    TOKEN="$(openssl rand -hex 16)"
  else
    TOKEN="$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  fi
  sed -i "s|^SA_TOKEN=.*|SA_TOKEN=${TOKEN}|" "$ENV_FILE"
  echo "   已生成 $ENV_FILE，令牌: ${TOKEN}"
  echo "   （想改端口/推送 key 就编辑这个文件，改完 systemctl restart ${SVC_NAME}）"
else
  echo "   $ENV_FILE 已存在，保留不动"
fi

echo "== 5/5 启动"
systemctl daemon-reload
systemctl enable "$SVC_NAME" >/dev/null 2>&1 || true
systemctl restart "$SVC_NAME"
sleep 2

if systemctl is-active --quiet "$SVC_NAME"; then
  # 本机防火墙：RHEL 系（OpenCloudOS / CentOS / Rocky）默认 firewalld 开着
  if command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld; then
    PORT="$(grep -E '^SA_PORT=' "$ENV_FILE" | tail -1 | cut -d= -f2)"
    PORT="${PORT:-8090}"
    firewall-cmd --permanent --add-port="${PORT}/tcp" >/dev/null 2>&1 || true
    firewall-cmd --reload >/dev/null 2>&1 || true
    echo "   已在 firewalld 放行 ${PORT}/tcp"
  fi

  echo
  echo "✅ 服务已启动: $(systemctl is-active "$SVC_NAME")"
  echo "   本机自检: curl -s http://127.0.0.1:8090/api/health | head -c 200"
  echo "   日志:     journalctl -u ${SVC_NAME} -f"
  echo "   公网访问: http://<服务器公网IP>:8090/?token=<上面那个令牌>"
  echo "   ⚠ 云厂商控制台的「防火墙/安全组」要放行 8090，否则外面打不开"
  if command -v getenforce >/dev/null 2>&1 && [[ "$(getenforce 2>/dev/null)" == "Enforcing" ]]; then
    echo "   ⚠ SELinux=Enforcing：若网页打不开，先 setenforce 0 验证是不是它拦的"
  fi
else
  echo "❌ 启动失败，看日志：journalctl -u ${SVC_NAME} -n 50 --no-pager"
  if command -v getenforce >/dev/null 2>&1 && [[ "$(getenforce 2>/dev/null)" == "Enforcing" ]]; then
    echo "   若日志里有 AVC denied：setenforce 0 后再试一次，能起来就是 SELinux 拦的"
  fi
  exit 1
fi
