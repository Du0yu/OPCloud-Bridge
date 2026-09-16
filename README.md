# OPCloud Bridge

作者：[@Du0yu](https://github.com/Du0yu)

为 [OPCloud Sandbox](https://opcloud-sandbox.web.app/) 增加本地模型导入、导出功能的油猴脚本。

安装后，OPCloud 页面右下角会显示“模型导入 / 导出”面板。模型文件只在本地浏览器中处理，不会上传到其他服务器。

## 功能

- 将当前完整模型导出为 `.opcl` 文件
- 导入 `.opcl` 或兼容的 `.json` 文件
- 将当前 OPD 导出为 2× 分辨率 JPEG
- 将当前 OPD 导出为可缩放的 SVG
- 导入后自动重建 OPD、导航树和 OPL
- 覆盖已有模型前进行确认
- 自动适配 OPCloud Webpack 模块编号变化
- 附带一个可直接导入的两菜晚餐示例模型

## 安装

### 方法一：从 Git 托管平台安装

1. 在浏览器中安装 [Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/)。
2. 在 GitHub、GitLab 等平台打开 `opcloud-model-io.user.js` 的 Raw 页面。
3. 用户脚本管理器会弹出安装页面，选择“安装”。
4. 打开或刷新 [OPCloud Sandbox](https://opcloud-sandbox.web.app/)。

### 方法二：本地安装

1. 打开用户脚本管理器，选择“添加新脚本”。
2. 将 [`opcloud-model-io.user.js`](./opcloud-model-io.user.js) 的全部内容粘贴进去。
3. 保存并刷新 OPCloud 页面。

## 使用

### 导出模型

1. 在 OPCloud 中完成或修改模型。
2. 点击页面右下角的“导出”。
3. 浏览器会下载一个格式化的 `.opcl` 文件。

### 导入模型

1. 点击页面右下角的“导入”。
2. 选择 `.opcl` 或兼容的 `.json` 文件。
3. 如果当前画布已有内容，确认是否替换。

### 导出图像

- 点击“导出 JPEG”下载当前 OPD 的 2× 分辨率位图。
- 点击“导出 SVG”下载当前 OPD 的矢量图；包含背景图片时优先使用 SVG。

可以先用 [`examples/Two-Dish-Dinner-Corrected.opcl`](./examples/Two-Dish-Dinner-Corrected.opcl) 测试导入。

## 本地校验

仓库不需要安装依赖。使用 Node.js 运行：

```bash
npm test
```

该命令检查用户脚本语法，并验证示例 OPCL 的 JSON、ID、OPD、状态父对象和连线引用。

## 工作原理

脚本复用 OPCloud 自己的模型接口：

- 导出调用模型的 `toJson()`。
- 导入调用模型的 `fromJson()`。
- 导入后调用 OPCloud 原生的树导航和图形渲染流程。

由于这些是站点内部接口，如果 OPCloud 将来进行较大的前端重构，脚本可能需要同步更新。

## Agent 使用说明

如果使用编码 Agent 生成或修改 JSON/`.opcl`，请让 Agent 先阅读 [`AGENTS.md`](./AGENTS.md)。它要求 Agent 交付可直接导入的完整文件，并定义了 OPCloud JSON 引用规则、OPM 连线枚举、状态转换方式、OPL 对应句式和提交前校验流程。

## 隐私

- 不包含统计或遥测代码。
- 不发送网络请求。
- 模型只通过本地文件读取和下载。

## License

[MIT](./LICENSE)

---

## English quick start

Install Tampermonkey or Violentmonkey, install `opcloud-model-io.user.js`, and refresh OPCloud Sandbox. Use the bottom-right panel to export the current model as `.opcl` or import an `.opcl`/`.json` file. No model data is uploaded.
