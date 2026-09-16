// ==UserScript==
// @name         OPCloud 图模型导入导出
// @namespace    https://opcloud-sandbox.web.app/
// @version      1.1.0
// @description  为 OPCloud Sandbox 增加本地 JSON/OPCL 导入与导出按钮
// @author       Du0yu
// @match        https://opcloud-sandbox.web.app/*
// @run-at       document-idle
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  'use strict';

  const page = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const PANEL_ID = 'opcloud-io-userscript-panel';
  const STATUS_OK_MS = 3200;

  let initService = null;
  let importInput = null;

  function setStatus(message, kind = 'info', timeout = STATUS_OK_MS) {
    const status = document.getElementById(`${PANEL_ID}-status`);
    if (!status) return;
    status.textContent = message;
    status.dataset.kind = kind;
    window.clearTimeout(setStatus.timer);
    if (timeout > 0) {
      setStatus.timer = window.setTimeout(() => {
        status.textContent = initService ? '已连接 OPCloud' : '正在连接 OPCloud…';
        status.dataset.kind = initService ? 'ok' : 'info';
      }, timeout);
    }
  }

  function safeFileName(value) {
    return String(value || 'OPCloud-Model')
      .replace(/[\\/:*?\"<>|\u0000-\u001f]/g, '_')
      .replace(/[. ]+$/g, '')
      .slice(0, 120) || 'OPCloud-Model';
  }

  function downloadJson(data, fileName) {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function getWebpackRequire() {
    const chunk = page.webpackChunkopcloud;
    if (!Array.isArray(chunk)) return null;

    let webpackRequire = null;
    const probeChunkId = Math.floor(Math.random() * 900000000) + 100000000;
    chunk.push([[probeChunkId], {}, (requireFunction) => {
      webpackRequire = requireFunction;
    }]);
    return webpackRequire;
  }

  function findInitService() {
    const webpackRequire = getWebpackRequire();
    if (!webpackRequire || !webpackRequire.m) return null;

    // The numeric module id changes between deployments, so locate the shared
    // module by its stable source-level function names instead of hard-coding it.
    const sharedModuleId = Object.keys(webpackRequire.m).find((id) => {
      const source = Function.prototype.toString.call(webpackRequire.m[id]);
      return source.includes('getInitRappidShared') && source.includes('setInitRappidShared');
    });
    if (!sharedModuleId) return null;

    const sharedExports = webpackRequire(sharedModuleId);
    const getter = Object.values(sharedExports).find((value) =>
      typeof value === 'function' && value.name === 'getInitRappidShared'
    ) || sharedExports.Km;
    if (typeof getter !== 'function') return null;

    const candidate = getter();
    if (!candidate || typeof candidate.getOpmModel !== 'function') return null;
    return candidate;
  }

  async function connect() {
    const startedAt = Date.now();
    while (!initService && Date.now() - startedAt < 30000) {
      try {
        initService = findInitService();
      } catch (error) {
        console.debug('[OPCloud I/O] Waiting for application runtime:', error);
      }
      if (!initService) await new Promise((resolve) => window.setTimeout(resolve, 400));
    }

    const buttons = document.querySelectorAll(`#${PANEL_ID} button`);
    buttons.forEach((button) => { button.disabled = !initService; });
    if (initService) {
      setStatus('已连接 OPCloud', 'ok', 0);
    } else {
      setStatus('连接失败，请刷新页面重试', 'error', 0);
    }
  }

  function currentModel() {
    if (!initService) throw new Error('尚未连接到 OPCloud');
    const model = initService.getOpmModel();
    if (!model || typeof model.toJson !== 'function' || typeof model.fromJson !== 'function') {
      throw new Error('当前页面未暴露兼容的模型接口');
    }
    return model;
  }

  function exportModel() {
    try {
      const model = currentModel();
      const json = model.toJson();
      const displayName = initService.modelService?.displayName || json.name || 'OPCloud-Model';
      const name = safeFileName(displayName);
      downloadJson(json, `${name}.opcl`);
      setStatus(`已导出：${name}.opcl`, 'ok');
    } catch (error) {
      console.error('[OPCloud I/O] Export failed:', error);
      setStatus(`导出失败：${error.message}`, 'error', 6000);
    }
  }

  function validateModel(json) {
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      throw new Error('文件内容不是 JSON 对象');
    }
    if (!Array.isArray(json.opds) || !Array.isArray(json.logicalElements)) {
      throw new Error('缺少 OPCloud 模型字段 opds / logicalElements');
    }
    if (json.opds.length === 0) {
      throw new Error('模型中没有 OPD');
    }
    return json;
  }

  function renderImportedModel(json) {
    const model = currentModel();
    model.fromJson(json);

    if (initService.oplService?.userOplSettings) {
      initService.oplService.userOplSettings.SDNames = true;
    }
    const tree = initService.getTreeView();
    tree.init(model);
    if (typeof tree.expandAllNodes === 'function') tree.expandAllNodes();
    initService.getGraphService().renderGraph(model.currentOpd, initService);
    initService.modelService.setName(json.name || 'Imported Model');
  }

  async function importModel(file) {
    try {
      const text = (await file.text()).replace(/^\uFEFF/, '');
      const json = validateModel(JSON.parse(text));
      const existing = currentModel();
      const hasContent = Array.isArray(existing.logicalElements) && existing.logicalElements.length > 0;
      if (hasContent && !window.confirm('导入会替换当前画布。请先导出需要保留的内容。\n\n确定继续吗？')) {
        setStatus('已取消导入', 'info');
        return;
      }

      renderImportedModel(json);
      setStatus(`已导入：${json.name || file.name}`, 'ok');
    } catch (error) {
      console.error('[OPCloud I/O] Import failed:', error);
      setStatus(`导入失败：${error.message}`, 'error', 7000);
    } finally {
      importInput.value = '';
    }
  }

  function createPanel() {
    if (document.getElementById(PANEL_ID)) return;

    const style = document.createElement('style');
    style.textContent = `
      #${PANEL_ID} {
        position: fixed; right: 14px; bottom: 14px; z-index: 2147483646;
        width: 218px; padding: 10px; box-sizing: border-box;
        border: 1px solid rgba(26,55,99,.24); border-radius: 9px;
        background: rgba(255,255,255,.96); color: #1a3763;
        box-shadow: 0 5px 20px rgba(26,55,99,.18);
        font: 13px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #${PANEL_ID} .opcloud-io-title { font-weight: 700; margin-bottom: 8px; }
      #${PANEL_ID} .opcloud-io-actions { display: flex; gap: 7px; }
      #${PANEL_ID} button {
        flex: 1; padding: 7px 9px; border: 0; border-radius: 6px;
        background: #497284; color: white; cursor: pointer; font: inherit;
      }
      #${PANEL_ID} button:hover { background: #365d70; }
      #${PANEL_ID} button:disabled { opacity: .45; cursor: wait; }
      #${PANEL_ID}-status { margin-top: 7px; min-height: 18px; font-size: 12px; color: #607080; }
      #${PANEL_ID}-status[data-kind="ok"] { color: #247344; }
      #${PANEL_ID}-status[data-kind="error"] { color: #b42318; }
    `;
    document.head.appendChild(style);

    const panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="opcloud-io-title">模型导入 / 导出</div>
      <div class="opcloud-io-actions">
        <button type="button" data-action="export" disabled>导出</button>
        <button type="button" data-action="import" disabled>导入</button>
      </div>
      <div id="${PANEL_ID}-status" data-kind="info">正在连接 OPCloud…</div>
    `;
    document.body.appendChild(panel);

    importInput = document.createElement('input');
    importInput.type = 'file';
    importInput.accept = '.opcl,.json,application/json';
    importInput.hidden = true;
    importInput.addEventListener('change', () => {
      const file = importInput.files?.[0];
      if (file) importModel(file);
    });
    panel.appendChild(importInput);

    panel.querySelector('[data-action="export"]').addEventListener('click', exportModel);
    panel.querySelector('[data-action="import"]').addEventListener('click', () => importInput.click());
  }

  createPanel();
  connect();
})();
