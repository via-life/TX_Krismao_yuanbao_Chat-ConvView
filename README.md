# 元宝对话还原可视化网页 · Yuanbao Chat ConvView

导入「真实用户 × 腾讯元宝」的对话 case 数据（CSV / XLSX / JSON），像素级还原元宝对话交互并可视化浏览。纯静态前端，无需构建，可直接部署到 GitHub Pages。

## 在线访问

> 部署后地址：`https://via-life.github.io/TX_Krismao_yuanbao_Chat-ConvView/`

## 功能

1. **数据输入**：拖拽整页任意位置或点击选择文件导入，支持两种数据格式，自动识别文件编码（UTF-8 / GBK / GB18030）。若表头列名与预期不符，弹出 **手动列映射** 界面（DeepOps Beacon 风格），可切换格式并把表格列对应到相应字段。
2. **数据总览**：Excel 隔行填充色表格展示全部 case 的摘要（trace ID / 首条提问 / 图片数 / 对话轮次），支持按 `trace ID` 或对话内容实时搜索，点击任意行进入还原界面。
3. **可视化还原**：像素级复刻元宝对话界面。左上角醒目展示 `trace ID` 主键徽标；按消息顺序还原多轮对话（用户气泡靠右 / 元宝回复靠左），最后一轮标为「当前轮次」，之前为「历史轮次」。图片以蓝色下划线链接呈现，点击在新标签页打开（不直接加载图片）。

## 支持的数据格式

导入时可在映射界面切换两种格式：

### 格式 A · 分列式（四列分开）

| 字段 | 说明 | 示例 |
|------|------|------|
| `trace ID` | 主键 | `heihe_1772409600_233` |
| `prompt` | 当前轮用户提问（纯文本） | `这个书法有什么特点` |
| `images` | JSON 数组字符串，当前轮图片 URL | `["http://img02.sogoucdn.com/..."]` |
| `history` | JSON 数组，历史轮次 | `[{"prompt":"...","answer":"...","images":[...],"convidx":"0"}]` |

### 格式 B · 整列式（单列含完整对话）

选择两列即可还原完整多轮对话：

| 字段 | 说明 | 示例 |
|------|------|------|
| `trace ID` | 主键 | `d9fef513e1574ae8...` |
| `对话内容` | 单列内含 OpenAI 风格 `messages` 数组 | `[{"role":"user","content":[{"type":"text","text":"..."},{"type":"image_url","image_url":{"url":"..."}}]},{"role":"assistant","content":"..."}]` |

> `content` 支持纯字符串，或由 `{"type":"text"}` / `{"type":"image_url"}` 段组成的数组；`role` 为 `user` / `assistant`。参考文件：`回复完整_已补全.xlsx`。

## 技术栈

- 纯静态 HTML + CSS + 原生 JS，免构建
- [PapaParse](https://www.papaparse.com/)（CSV 解析，CDN）
- [SheetJS](https://sheetjs.com/)（XLSX 解析，CDN）
- 浏览器原生 `TextDecoder`（编码回退）
- 设计参考：[StyleForge](https://github.com/via-life/StyleForge)（玻璃拟态外壳）、DeepOps Beacon（选列界面）、元宝网页版（还原界面）；设计系统由 `ui-ux-pro-max` skill 辅助生成

## 本地运行

```bash
cd TX_Krismao_yuanbao_Chat-ConvView
python -m http.server 8080
# 浏览器打开 http://localhost:8080
```

## 文件结构

```
TX_Krismao_yuanbao_Chat-ConvView/
├── index.html         # 单页三视图
├── css/styles.css     # 样式（玻璃拟态 / Beacon / 元宝）
├── js/parse.js        # 文件解析 + 编码回退 + JSON 列解析
├── js/yuanbao.js      # 元宝对话流渲染
├── js/app.js          # 状态机与视图路由
└── .nojekyll          # GitHub Pages 托管
```
