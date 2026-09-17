# OPCloud Bridge

为 [OPCloud Sandbox](https://opcloud-sandbox.web.app/) 增加本地模型导入、导出功能，并允许 Codex、Claude 等 Agent 通过 MCP 操作当前浏览器中的模型。

安装后，OPCloud 页面右下角会显示“模型导入 / 导出”面板。模型文件只在本地浏览器中处理，不会上传到其他服务器。

## 在线一键安装

先安装 [Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/)，然后点击：

### [➡️ 一键安装 OPCloud Bridge](https://raw.githubusercontent.com/Du0yu/OPCloud-Bridge/main/opcloud-model-io.user.js)

用户脚本管理器会自动打开安装确认页。脚本内置更新地址，发布更高版本后可由用户脚本管理器自动检查更新。

## 功能

![OPCloud Bridge 已连接 OPCloud 和 MCP Agent](assets/demo.png)

- 将当前完整模型导出为 `.opcl` 文件
- 导入 `.opcl` 或兼容的 `.json` 文件
- 将当前 OPD 导出为 2× 分辨率 JPEG
- 将当前 OPD 导出为可缩放的 SVG
- 导入后自动重建 OPD、导航树和 OPL
- 覆盖已有模型前进行确认
- 自动适配 OPCloud Webpack 模块编号变化
- 附带一个可直接导入的两菜晚餐示例模型
- 提供本地 MCP Server，支持 Agent 读取、导入、校验模型以及读取 OPL、导出图像
- 油猴脚本自动连接本机 MCP 桥，无需修改 OPCloud 网站

## Agent / MCP 模式

整体连接方式如下：

```text
Codex / Claude / MCP Client
          ↕ MCP stdio
本地 OPCloud Bridge 进程
          ↕ WebSocket（127.0.0.1:17373）
油猴脚本 ↔ OPCloud 页面
```

油猴脚本不能在浏览器中监听端口，因此本地进程同时充当 MCP Server 和 WebSocket Server。油猴脚本会主动连接它，并在断开后自动重试。

### MCP 客户端配置

安装油猴脚本后，可让 MCP 客户端直接从 GitHub 启动桥接程序：

```json
{
  "mcpServers": {
    "opcloud": {
      "command": "npx",
      "args": ["-y", "github:Du0yu/OPCloud-Bridge"]
    }
  }
}
```

部分 Windows 客户端需要将 `command` 写成 `npx.cmd`。配置完成后重启 MCP 客户端，并打开或刷新 [OPCloud Sandbox](https://opcloud-sandbox.web.app/)。右下角出现“`MCP：Agent 已连接`”即连接成功。

也可以克隆仓库并在本地运行：

```bash
npm install
npm start
```

本地源码模式下，在 MCP 配置中将命令设为 `node`，参数设为 `mcp-server/server.js` 的绝对路径。

使用 Codex CLI 可以直接登记本地源码版本：

```powershell
codex mcp add opcloud -- node "C:\path\to\OPCloud-Bridge\mcp-server\server.js"
codex mcp get opcloud
```

请将 `C:\path\to\OPCloud-Bridge` 替换为你克隆本仓库后的实际绝对路径。

登记后请新建一个 Codex 会话。MCP Server 会由 Codex 自动启动，不需要同时手动运行 `npm start`。随后打开或刷新 OPCloud；油猴面板显示“`MCP：Agent 已连接`”即表示浏览器桥已接通。

### 连接测试

在新 Agent 会话中依次调用：

1. `opcloud_status`：应返回 `connected: true` 和 `opcloud.ready: true`；
2. `opcloud_get_model`：应能读取当前模型、OPD 和 logical elements；
3. `opcloud_get_opl`：应能读取当前模型生成的 OPL；
4. `opcloud_review_diagram`：应同时返回模型摘要、OPL 和 MIME 类型为 `image/jpeg` 的实际画布图像。

项目已使用空白 OPCloud 模型完成过一次端到端实测：油猴脚本 `1.3.0` 成功连接本机 WebSocket，Agent 读取到 `Model (Not Saved)`、空 OPL，以及与空模型一致的白色 JPEG 画布。

### MCP 工具

| 工具 | 用途 |
|---|---|
| `opcloud_status` | 检查油猴脚本、网页和模型是否就绪 |
| `opcloud_get_model` | 读取当前完整模型 JSON |
| `opcloud_import_model` | 将完整 JSON/OPCL 模型载入当前页面 |
| `opcloud_get_opl` | 获取 OPCloud 生成的 OPL sentences |
| `opcloud_validate_model` | 检查 JSON、ID、OPD、状态父对象及连线引用 |
| `opcloud_export_image` | 将当前 OPD 返回为 JPEG 或 SVG |
| `opcloud_review_diagram` | 一次返回模型摘要、OPL 和当前 OPD 的实际 JPEG，供 Agent 看图审阅 |

当当前画布非空时，`opcloud_import_model` 必须显式传入 `replaceExisting: true`，避免 Agent 意外覆盖模型。

推荐让 Agent 按以下闭环执行：

```text
读取当前模型 → 生成或修改 → 校验 → 导入 → 读取 OPL + 实际导出图像 → 修正 → 再次导入和审阅
```

`opcloud_review_diagram` 返回的是 OPCloud 当前画布通过原生 `toJPEG()` 生成的图像，而不是根据 JSON 重新绘制的近似图。支持图像输入的 MCP 客户端会把该 JPEG 直接交给 Agent，因此 Agent 可以检查元素遮挡、文字裁切、状态位置、连线交叉和遗漏元素。

## 安装

### 方法一：从 Git 托管平台安装

1. 在浏览器中安装 [Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/)。
2. 点击[一键安装链接](https://raw.githubusercontent.com/Du0yu/OPCloud-Bridge/main/opcloud-model-io.user.js)。
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

使用 Node.js 20 或更高版本安装依赖并运行：

```bash
npm install
npm test
```

该命令检查用户脚本和 MCP Server 语法，并验证示例 OPCL 的 JSON、ID、OPD、状态父对象和连线引用。

## 工作原理

脚本复用 OPCloud 自己的模型接口：

- 导出调用模型的 `toJson()`。
- 导入调用模型的 `fromJson()`。
- 导入后调用 OPCloud 原生的树导航和图形渲染流程。
- MCP Server 使用标准输入输出与 Agent 通信，再通过本机 WebSocket 将工具调用转发给油猴脚本。

由于这些是站点内部接口，如果 OPCloud 将来进行较大的前端重构，脚本可能需要同步更新。

## Agent 使用说明

如果使用编码 Agent 生成或修改 JSON/`.opcl`，请让 Agent 先阅读 [`AGENTS.md`](./AGENTS.md)。它要求 Agent 交付可直接导入的完整文件，并定义了 OPCloud JSON 引用规则、OPM 连线枚举、状态转换方式、OPL 对应句式和提交前校验流程。

## 隐私

- 不包含统计或遥测代码。
- 普通导入、导出模式不发送网络请求。
- MCP 模式只连接 `127.0.0.1:17373`，不会把模型上传到远程服务器。
- 本地 WebSocket 只接受来源为 `https://opcloud-sandbox.web.app` 的浏览器连接。
- MCP 服务只监听回环地址，不接受局域网或公网连接。

## License

[MIT](./LICENSE)

---

## English quick start

Install Tampermonkey or Violentmonkey, install `opcloud-model-io.user.js`, and refresh OPCloud Sandbox. The bottom-right panel supports local import/export. To let an Agent operate OPCloud, run `npx -y github:Du0yu/OPCloud-Bridge` as an MCP stdio server; the userscript connects to its localhost WebSocket automatically.
