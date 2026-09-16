# AGENT_CHANGELOG

| 时间 | 修改的所有文件名称 | 修改的内容 | 使用的智能体名称 | GitHub版本号 |
| --- | --- | --- | --- | --- |
| 2026-07-15 15:22 | `index.html`、`css/styles.css`、`js/app.js`、`js/yuanbao.js`、`js/markdown.js`、`README.md`、`AGENT_CHANGELOG.md` | 新增安全 Markdown 渲染，支持换行、标题、加粗、列表、引用、代码块与表格，并在详情页和实时预览统一生效。 | Codex GPT-5 | 196e2df |
| 2026-09-16 11:01 | `js/parse.js`、`js/app.js`、`index.html`、`README.md`、`AGENT_CHANGELOG.md` | 手动粘贴预览与文件导入新增 Python 字典/列表字面量（单引号、True/False/None）兼容解析，修复粘贴 Python print() 导出数据时误报"JSON 格式有误"的问题；文件批量导入路径对单行解析异常静默降级，不再中断整批导入。 | Claude Sonnet 4.5 | c44c4ff |
| 2026-09-16 11:30 | `js/parse.js`、`README.md`、`AGENT_CHANGELOG.md` | 补齐批量导入场景：上传的 `.json` 文件整体也兼容 Python 单引号字典/列表字面量（此前只有单元格里的 history/images 列内容支持，文件顶层仍严格要求标准 JSON），并导出 `Parser.parseJSON` 供校验。 | Claude Sonnet 4.5 | 4e5eb78 |
