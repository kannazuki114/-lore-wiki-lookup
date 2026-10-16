---
version: alpha
name: "人物与剧情 Wiki 查询"
description: "酒馆里的资料检索工具，搜索优先，来源清楚，长文按需阅读。"
colors:
  primary: "#c8a979"
  primaryText: "#201c17"
  warning: "#ceaa72"
typography:
  body:
    fontFamily: "inherit"
rounded:
  DEFAULT: "7px"
  panel: "12px"
spacing:
  panel: "18px"
  controlGap: "8px"
components:
  button:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primaryText}"
  input: {}
  result: {}
  warning:
    textColor: "{colors.warning}"
---

# 人物与剧情查询设计约定

## Overview

面向中文酒馆用户，主要任务是输入角色名、读到有来源的资料，再决定是否用于回复。依据用户本轮“界面更简单易懂”和 README/API_NOTES 的联网优先要求。

视觉沿用现有低饱和暖金与宿主主题，像资料索引页：搜索是第一页的主角，结果标题清晰，长文有折叠层次。避免大幅品牌横幅、英文装饰词、默认展开的技术设置和无限长资料墙。中文界面不代表日本市场产品；日文仅可能出现在资料原文。

现有 `style.css` 的 `.lore-wiki-panel` CSS 变量是运行时唯一 token 来源（Model B）；本文镜像其已采用值，不生成第二套主题。`--lore-accent`→主按钮、链接、焦点；`--lore-line`→边框；`--lore-surface`→控件背景；`--lore-warning`→提醒；`--lore-scroll-thumb`→所有自有滚动区域。宿主负责底色、文字色和字体。

## Colors

暖金用于查询主动作和来源链接；警告同时有文字说明。文字与背景继承酒馆，控件使用低透明度中性底色。原生 select 的弹出层由系统负责，不自行模拟；forced-colors 使用系统颜色。

## Typography

继承宿主中文字体及大小，不下载远程字体。正文行高 1.7，辅助说明较小但不压低到难以辨认；标题用粗细区分层级。原文保留简繁与日文，不用翻译推断字段。

## Layout

单列、自然文档滚动，搜索→资料类型→查询→状态→结果→更多设置。窄屏控件换行，子项最小宽度为零，所有文字可换行。长字段默认展示短预览，原文始终可点击展开。状态行预留高度，查询主按钮不因加载改宽。

## Elevation & Depth

用边框、留白和结果左侧细线表达层级，不新增阴影、浮动弹层或动画。

## Shapes

控件圆角 7px、外面板 12px；延续已有样式，避免按钮全部胶囊化。

## Components

语义 button、label、select、details 是共享控件。按钮提供 hover/focus/active/disabled；状态复用面板的 aria-live 区域。查询可回车提交、清空和取消，输入法合成中不提交。资料预设和自定义字段使用同一勾选状态。结果不显示空字段墙，缺失字段汇总说明。

## Do's and Don'ts

默认展示搜索，不展示桥接与模型设置；技术设置可展开。保留来源与读取方式限制；不把正文、页面分类或模型概括伪装为明确人物属性。结果页内长文折叠只影响显示，不改变查询资料。详细交互约定见 UX-CONTRACT.md。
