# 服务器协商认证

用户在 Melted 中选择服务器后，客户端读取 `/.well-known/melted` 的 `auth`：

```json
{"version":1,"methods":["password","api_key"],"preferred":"password"}
```

只有一种方式时直接显示对应表单；多种方式按 `preferred` 选择，并允许切换。客户端只使用自己认识的协议适配器，不执行服务器下发的 HTML、脚本或任意表单。完全不支持时提示更新或联系运营者，不创建另一套身份。发送凭据前仍需确认服务器与处理声明。HTTPS 为必需，只有本机开发地址允许 HTTP；认证请求不跟随重定向。

| 方法 | 配置前提 | 固定端点 |
| --- | --- | --- |
| `password` | 预置 username 和 password_hash | `POST /v1/auth/password/sessions` |
| `api_key` | 预置 api_key_hashes | `POST /v1/auth/api-key/sessions` |
| `browser` | 配置 OIDC issuer/client，保留双侧 PKCE、state、nonce | `/v1/auth/browser/*` |
| `key` | 显式启用身份密钥方式 | `/v1/auth/key/*` |

未设置 `authentication` / `AUTH_CONFIG` 的旧部署继续提供 `key`，配置 OIDC 时再提供 `browser`。显式设置后只启用列表中的方式；未启用接口返回 `404 auth_method_unavailable`。错误凭据返回 `401 invalid_credentials`，不会透露账号是否存在。服务端配置有误时拒绝启动/请求，不用默认登录方式掩盖问题。

## 配置预置账户

Node 的私有 YAML 使用 `authentication`，环境变量及 Workers secret 使用同结构的 JSON `AUTH_CONFIG`。它是运营者持有的敏感配置，不放入 discovery、公开仓库或 Wrangler 的明文 vars。

```yaml
authentication:
  methods: [password, api_key]
  preferred: password
  accounts:
    - subject: personal-reader
      username: reader
      password_hash: <credentials 命令生成的完整摘要>
      api_key_hashes:
        - <credentials 命令生成的 SHA-256 摘要>
```

`subject` 是稳定的服务器内部身份；不要因用户名修改或凭据轮换而改变。相同 subject 的密码/API Key 映射到同一账户，不同 subject 隔离；与 P-256、OIDC 账户采用不同命名空间，不按用户名/邮箱自动合并。已有旧账户不会自动迁移内容。预置账户由运营者授权，`registration: closed` 只关闭密钥/OIDC 自助开户，不禁止这些账户登录。

当前配置最多 100 个账户，每账户最多 10 个 API Key 摘要，适合小型自托管。缺少凭据、重复 subject/用户名/密钥摘要、未知方式或不可用的首选方式会拒绝配置。需要注册、找回密码、MFA、组织目录的部署应使用 OIDC 提供方；这些能力没有伪装为本地账号系统已实现。

## 生成凭据

构建后通过 `credentials.js` 从 stdin 读取 JSON，秘密不经过命令行参数。密码输入结构为 `{subject, username, password}`，密码长度 12–1024；输出只有账户和摘要。API Key 输入只有 `{subject}`，输出一次性可见的随机 `api_key` 和可放入配置的 `account`，原始 key 交给对应用户后妥善保管。

```sh
node dist/server/src/entrypoints/credentials.js password < /run/secrets/melted-account-input.json
node dist/server/src/entrypoints/credentials.js api-key < /run/secrets/melted-subject-input.json
```

本机开发通过 Apple Container 运行，例如把私有输入放在 `.local/credential-input.json`（权限 0600），然后执行：

```sh
python3 scripts/dev.py exec sh -c 'npm run --silent credentials -- password < /workspace/.local/credential-input.json'
```

将输出中的 account 字段合并到同一 subject，不要保留重复账户行。不要使用 README 示例作为真实密码，或把含秘密的输入/输出提交到版本库。Cloudflare 使用 `wrangler secret put AUTH_CONFIG` 输入 JSON；本地 emulator 可使用忽略的 `.dev.vars`。配置更新后重新启动 Node 或更新 Worker。

密码使用带独立随机盐的 scrypt（N=16384、r=8、p=5、32 字节输出），采用 [OWASP 列出的 16 MiB 配置](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt)，通过两端的 `node:crypto` 实现。Workers 需要 `nodejs_compat`，见 [Cloudflare crypto 支持](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/)。未知账号也执行同等推导，摘要比较使用 timingSafeEqual；每 isolate 限制一个推导，繁忙返回 503。凭据请求有 IP 限流，密码另有账号限流。真实容量和 CPU 额度仍需部署者在目标套餐上测量，本地 workerd 验证不等于线上容量承诺。

API Key 是 32 字节随机量（`melted_` 前缀和 base64url），服务端只保存 SHA-256 摘要。它用于换取完整账户会话，不能直接用作普通 API 的 bearer，也不是后续受 scope 限制的摄取 token。

## 会话与轮换

所有方式换取同一 Session：access 15 分钟、会话族最长 30 天，refresh 轮换、重放撤销和退出保持一致。客户端只把会话放入本机 Keychain；密码/API Key 不持久化，切换表单、服务器或提交后清空秘密输入。只有 `key` 方式访问身份私钥；正常重启先恢复已有会话，不重复输入密码。

移除摘要或停用方式阻止后续登录，**不会立即撤销已经签发的会话**。当前退出撤销当前会话族；全设备撤销、用户自助轮换、账号合并和管理 UI 尚未实现。不要将配置轮换宣传为即时踢出所有设备。
