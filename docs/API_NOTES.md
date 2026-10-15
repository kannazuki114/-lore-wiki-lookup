# 萌娘百科 API 与参考项目核对

## v0.3 酒馆生成与副模型接入

官方参考：<https://docs.sillytavern.app/for-contributors/writing-extensions/>。

- manifest 的 `generate_interceptor` 指向全局 `LoreWikiLookup_Intercept`；拦截函数返回的字符串仅供调用者诊断，实际通过宿主 `setExtensionPrompt` 写入独立自动资料块。
- 支持 `GENERATION_AFTER_COMMANDS` 的宿主可走事件兜底，同一输入复用正在执行或本轮完成的任务。quiet／impersonate 不触发自动查询；独立取消控制避免迟到写回。
- 手动当前连接整理按官方 `generateRaw({ systemPrompt, prompt })` 签名调用；记录内部生成范围以避免递归触发自动查询和误清理。宿主不提供此接口时提示改用独立桥接。
- 独立副模型桥接使用服务端环境配置的 Chat Completions 兼容接口；浏览器不能指定目标模型 URL 或获取 API Key。此功能仅进行资料整理，不让副模型写入资料库或直接调用工具。
- 模型返回必须为带 claims/evidence 的 JSON，来源编号和原文短句均在客户端核对；该检查不能验证概括与证据的语义必然一致，结果仍标注 AI 整理。

## v0.2 补充

- 新增通用 MediaWiki 适配器 `src/mediawiki.js`：站点信息、页面、页面分类、分类名称搜索、分类页面／子分类成员。
- `siteinfo` 获取站点名和 `articlepath`，用于自定义来源链接；分类搜索限定 namespace 14；子分类使用 `cmtype=subcat`。
- 实际 THBWiki 的 formatversion=2 返回 `parse.properties` 为对象，已兼容对象及旧数组形式，使用 `disambiguation` 属性识别消歧页面。
- 实际萌百 MoeSkin HTML 的正文位于 `template#MOE_SKIN_TEMPLATE_BODYCONTENT`。提取器读取其 inert content，不执行页面脚本。
- v0.2 上游桥接复用 `createClientFromEnv` 和 `Api` 认证客户端；只读请求与返回规范化由本地共享模块负责，已替代 v0.1 的 `getOperationByName` 调用。认证服务端请求省略 `origin=*`，避免与匿名 CORS 语义混淆。
- 公共 Wiki 桥接与萌百认证请求分离。公共请求固定经验证的公网 IPv4 DNS 结果、不跟随重定向、不发送 Cookie 和账号凭据。
- 实际公共 API 验证来源：<https://thwiki.cc/api.php>；真实人物页面：<https://zh.moegirl.org.cn/博丽灵梦>、<https://thwiki.cc/博丽灵梦>。本机快照和原始响应仅保存于忽略入库的 `test/live/`。

以下为 v0.1 核对历史；关于调用 `getOperationByName` 的描述已被上述 v0.2 实现替代。

核对日期：2026-10-15。

用户给出的官方主模块文档：<https://mzh.moegirl.org.cn/api.php?action=help&modules=main>。已通过本机 HTTP 读取全文；网页检索工具无法打开该 URL。文档快照仅用于本次核对，不作为插件运行依赖。

## 官方主模块文档影响实现的约束

- `action=query` 读取数据；`action=parse` 读取页面解析结果；`action=login` 返回认证 Cookie。
- 未认证跨域请求使用 `origin=*`。已认证跨域需要匹配 Origin 且来源被允许；通配 Origin 不能解决登录限制。因此通过本地 Node 桥接管理 Cookie。
- API 错误需要检查响应内容及错误信息，不能只检查 HTTP 状态。
- API 输入使用 NFC UTF-8；本地检索另做 NFKC 归一化以支持全角条件。
- 布尔参数只要出现即视为真；需要 false 时省略。桥接使用的 redirects 仅在需要时传递。
- `assertuser` 可验证当前会话身份，上游客户端已在登录后自动设置。

补充的通用官方文档：

- <https://www.mediawiki.org/wiki/API:Search>
- <https://www.mediawiki.org/wiki/API:Parsing_wikitext>
- <https://www.mediawiki.org/wiki/API:Categorymembers>

## 上游接口映射

| 插件操作 | 上游 operation | MediaWiki 请求 | 用途 |
|---|---|---|---|
| 候选搜索 | search | query + list=search | 返回标题、摘要、分页 |
| 页面字段提取 | get-page，format=html | parse，text/displaytitle/revid/sections | 在前端提取信息栏和章节 |
| 分类核验 | get-categories | query + prop=categories | 显式分类字段和规范标题 |
| 分类枚举 | get-category-members，type=page | query + list=categorymembers | 类似原查卡器的系列条目枚举 |

源码：<https://github.com/AnnAngela/moegirlpedia-mediawiki-api>，本次固定读取提交 `f4e54795741adcce931cf47fd8f3c4d5274f296b`。

项目不是浏览器 SDK，也不是直接可访问的公共 HTTP 服务。它的 Api 使用 Node 环境、tough-cookie、登录令牌与 assertuser。此插件利用构建脚本把 `createClientFromEnv` 和 `getOperationByName` 打包成一个服务端模块，以便同一会话连续查询，避免逐条启动 CLI 和重复登录。

适配差异：上游 get-categories 未主动设置 redirects；桥接为该读取操作加上 redirects，避免正文跟随了重定向而分类仍取旧页面。桥接限制操作和分页键，防止上游展开 continuation 时覆盖 action 等参数。没有对上游仓库做源码修改。

## 实际网络结果与验证边界

| 请求 | 本机结果 |
|---|---|
| zh 域名 siteinfo | HTTP 200，正常 JSON |
| zh 域名匿名 search | HTTP 200，action-notallowed / Unauthorized API call |
| mzh 域名匿名 search | HTTP 200，同样被拒绝；带 origin=* 返回 ACAO=* |
| mzh 主模块 help | 可读，已核对主模块参数 |
| 真实账号登录后查询 | 未执行，没有用户配置的凭据 |

不把模拟响应测试当作真实账号联网成功，也不绕过站点认证或访问限制。
