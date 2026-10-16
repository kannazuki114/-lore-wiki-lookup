# 查询面板交互约定

依据：用户要求直接联网、离线补充、简化界面；README.md；docs/API_NOTES.md 的 API 与字段完整性边界。视觉依据 DESIGN.md。

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Select/Listbox | 原生 select，panel.js / workflow-ui.js | 本文：接受系统弹窗尺寸和键盘交互 | native | tools/test-browser.mjs、tools/test-ui.mjs |
| Form | 各模块现有 label + input / textarea，统一 style.css | 本文：显式保存，不自动丢失输入；输入错误与状态关联 | native controls, no native form submission | 同上 |
| Scrollbar | style.css，作用域 .lore-wiki-panel | DESIGN.md 的运行时 CSS token | 标准属性 + WebKit 后备 | tools/test-ui.mjs |
| Toast | panel.js 的 status / 模块局部状态行 | 本文：操作结果就地反馈，aria-live，不用原生对话框 | inline live region | tools/test-ui.mjs |
| CRUD | library.js + workflow-ui.js | README.md：导入先预览、保存版本检查、删除可恢复 | 本地、单步恢复 | test/workflows.test.mjs、tools/test-browser.mjs |

不是表格或独立路由应用；无日期选择，不新增表格选择、路由、全局弹窗或设计系统依赖。

- 搜索明确点击或回车提交，不按键自动联网，因此不需要 debounce；合成输入不提交。查询状态仅本页保存，不写宿主 URL，避免干扰酒馆路由并泄露聊天作品信息。
- 查询→读取中（可取消）→本批结果／无匹配／部分失败。失败保留输入，可直接重试。清空取消在途请求、清除结果与游标并回焦搜索框；改变条件使旧查询失效，迟到结果不能覆盖。
- 翻页采用显式“下一批”，只表示本批，不虚构总数。改变来源、条件、字段后重置游标。返回上级恢复查询和筛选。
- 结果展示明确原文；长字段折叠可展开全文；缺失字段汇总；过滤失败显示中文字段名。可选原文用于补充阅读，不把原文自动归为性格等事实。
- “用于下一轮回复”以当前查询为准；资料或聊天改变后失效。预算内保留来源和完整文字段落，截取时明确提示。生成结束及切换聊天清除提示词。
- 设置、自动查询、模型整理、资料库默认折叠。模型整理不参与联网搜索，默认关闭，密钥仅内存持有。令牌可显式显示／隐藏，不写 URL 或日志。
- 数据编辑保持原有预览、保存和单步恢复，删除后有恢复动作；自定义 Wiki 删除不删除本地资料。没有新增不可恢复操作。
- zh-CN 界面、日期本地化；原生语义、焦点可见、窄屏换行、降低动效与强制颜色模式下可操作。
