// ==UserScript==
// @name         OPCloud Bridge - Model Import/Export
// @name:en      OPCloud Bridge - Model Import/Export
// @name:zh-CN   OPCloud 图模型导入导出
// @namespace    https://opcloud-sandbox.web.app/
// @version      1.4.0
// @description  Add model import/export and a local MCP Agent bridge to OPCloud Sandbox
// @description:en Add model import/export and a local MCP Agent bridge to OPCloud Sandbox
// @description:zh-CN 为 OPCloud Sandbox 增加模型导入导出与本地 MCP Agent 桥接
// @author       Du0yu
// @match        https://opcloud-sandbox.web.app/*
// @downloadURL  https://raw.githubusercontent.com/Du0yu/OPCloud-Bridge/main/opcloud-model-io.user.js
// @updateURL    https://raw.githubusercontent.com/Du0yu/OPCloud-Bridge/main/opcloud-model-io.user.js
// @run-at       document-idle
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  'use strict';

  const page = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const PANEL_ID = 'opcloud-io-userscript-panel';
  const STATUS_OK_MS = 3200;
  const USERSCRIPT_VERSION = '1.4.0';
  const DEFAULT_BRIDGE_URL = 'ws://127.0.0.1:17373';
  const LANGUAGE_STORAGE_KEY = 'opcloudBridgeLanguage';
  const TRANSLATIONS = {
    en: {
      title: 'Model Import / Export',
      switchLanguage: '中文',
      switchLanguageTitle: 'Switch to Chinese',
      exportModel: 'Export model',
      importModel: 'Import model',
      exportJpeg: 'Export JPEG',
      exportSvg: 'Export SVG',
      exportJpegTitle: 'Export the current OPD at 2× resolution',
      exportSvgTitle: 'Export the current OPD as a vector image',
      connecting: 'Connecting to OPCloud…',
      connected: 'Connected to OPCloud',
      connectionFailed: 'Connection failed. Refresh the page to retry.',
      bridgeConnecting: 'MCP: Connecting to local service…',
      bridgeConnected: 'MCP: Agent connected',
      bridgeWaiting: 'MCP: Waiting for local service',
      invalidImageData: 'OPCloud returned invalid image data',
      notConnected: 'Not connected to OPCloud',
      incompatibleModel: 'This page does not expose a compatible model API',
      exported: 'Exported: {name}',
      exportFailed: 'Export failed: {message}',
      jpegUnsupported: 'This OPCloud version does not support JPEG export',
      generatingJpeg: 'Generating JPEG…',
      jpegExportFailed: 'JPEG export failed: {message}',
      svgUnsupported: 'This OPCloud version does not support SVG export',
      generatingSvg: 'Generating SVG…',
      svgExportFailed: 'SVG export failed: {message}',
      unsupportedImageFormat: 'Unsupported image format: {format}',
      fileNotJsonObject: 'The file does not contain a JSON object',
      missingModelFields: 'Missing OPCloud model fields: opds / logicalElements',
      modelHasNoOpd: 'The model contains no OPD',
      oplUnsupported: 'This OPCloud version does not expose a compatible OPL API',
      pageNotReady: 'The OPCloud page has not finished initializing',
      canvasNotEmptyAgent: 'The canvas is not empty. Retry with replaceExisting=true.',
      agentImported: 'Agent imported: {name}',
      unknownAgentAction: 'Unknown Agent action: {action}',
      replaceConfirm: 'Importing will replace the current canvas. Export anything you want to keep first.\n\nContinue?',
      importCancelled: 'Import cancelled',
      imported: 'Imported: {name}',
      importFailed: 'Import failed: {message}',
    },
    zh: {
      title: '模型导入 / 导出',
      switchLanguage: 'EN',
      switchLanguageTitle: '切换到英文',
      exportModel: '导出模型',
      importModel: '导入模型',
      exportJpeg: '导出 JPEG',
      exportSvg: '导出 SVG',
      exportJpegTitle: '导出当前 OPD，2× 分辨率',
      exportSvgTitle: '导出当前 OPD 矢量图',
      connecting: '正在连接 OPCloud…',
      connected: '已连接 OPCloud',
      connectionFailed: '连接失败，请刷新页面重试',
      bridgeConnecting: 'MCP：正在连接本地服务…',
      bridgeConnected: 'MCP：Agent 已连接',
      bridgeWaiting: 'MCP：等待本地服务',
      invalidImageData: 'OPCloud 返回了无效的图像数据',
      notConnected: '尚未连接到 OPCloud',
      incompatibleModel: '当前页面未暴露兼容的模型接口',
      exported: '已导出：{name}',
      exportFailed: '导出失败：{message}',
      jpegUnsupported: '当前 OPCloud 版本不支持 JPEG 导出',
      generatingJpeg: '正在生成 JPEG…',
      jpegExportFailed: 'JPEG 导出失败：{message}',
      svgUnsupported: '当前 OPCloud 版本不支持 SVG 导出',
      generatingSvg: '正在生成 SVG…',
      svgExportFailed: 'SVG 导出失败：{message}',
      unsupportedImageFormat: '不支持的图像格式：{format}',
      fileNotJsonObject: '文件内容不是 JSON 对象',
      missingModelFields: '缺少 OPCloud 模型字段 opds / logicalElements',
      modelHasNoOpd: '模型中没有 OPD',
      oplUnsupported: '当前 OPCloud 版本未暴露兼容的 OPL 接口',
      pageNotReady: 'OPCloud 页面尚未完成初始化',
      canvasNotEmptyAgent: '当前画布非空；请显式设置 replaceExisting=true 后重试',
      agentImported: 'Agent 已导入：{name}',
      unknownAgentAction: '未知的 Agent 操作：{action}',
      replaceConfirm: '导入会替换当前画布。请先导出需要保留的内容。\n\n确定继续吗？',
      importCancelled: '已取消导入',
      imported: '已导入：{name}',
      importFailed: '导入失败：{message}',
    },
  };

  function initialLanguage() {
    try {
      const saved = page.localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (saved === 'en' || saved === 'zh') return saved;
    } catch {
      // Continue with the browser language when storage is unavailable.
    }
    const browserLanguages = page.navigator.languages || [page.navigator.language || 'en'];
    return browserLanguages.some((value) => String(value).toLowerCase().startsWith('zh')) ? 'zh' : 'en';
  }

  let language = initialLanguage();

  function t(key, values = {}) {
    const template = TRANSLATIONS[language][key] || TRANSLATIONS.en[key] || key;
    return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? `{${name}}`));
  }

  let initService = null;
  let importInput = null;
  let bridgeSocket = null;
  let bridgeReconnectTimer = null;
  let bridgeReconnectDelay = 1000;

  function setStatus(message, kind = 'info', timeout = STATUS_OK_MS) {
    const status = document.getElementById(`${PANEL_ID}-status`);
    if (!status) return;
    status.textContent = message;
    status.dataset.kind = kind;
    window.clearTimeout(setStatus.timer);
    if (timeout > 0) {
      setStatus.timer = window.setTimeout(() => {
        status.textContent = initService ? t('connected') : t('connecting');
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

  function bridgeUrl() {
    try {
      return page.localStorage.getItem('opcloudBridgeUrl') || DEFAULT_BRIDGE_URL;
    } catch {
      return DEFAULT_BRIDGE_URL;
    }
  }

  function setBridgeStatus(message, kind = 'info') {
    const status = document.getElementById(`${PANEL_ID}-bridge-status`);
    if (!status) return;
    status.textContent = message;
    status.dataset.kind = kind;
  }

  function downloadBlob(blob, fileName) {
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

  function downloadJson(data, fileName) {
    const json = JSON.stringify(data, null, 2);
    downloadBlob(new Blob([json], { type: 'application/json;charset=utf-8' }), fileName);
  }

  function jpegDataUrlToBlob(imageData) {
    const encoded = imageData.replace(/^data:image\/(?:png|jpeg|jpg);base64,/, '');
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], { type: 'image/jpeg' });
  }

  function bytesToBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
  }

  function dataUrlBase64(imageData) {
    const separator = imageData.indexOf(',');
    if (separator < 0) throw new Error(t('invalidImageData'));
    return imageData.slice(separator + 1);
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

    const buttons = document.querySelectorAll(`#${PANEL_ID} .opcloud-io-actions button`);
    buttons.forEach((button) => { button.disabled = !initService; });
    if (initService) {
      setStatus(t('connected'), 'ok', 0);
    } else {
      setStatus(t('connectionFailed'), 'error', 0);
    }
  }

  function currentModel() {
    if (!initService) throw new Error(t('notConnected'));
    const model = initService.getOpmModel();
    if (!model || typeof model.toJson !== 'function' || typeof model.fromJson !== 'function') {
      throw new Error(t('incompatibleModel'));
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
      setStatus(t('exported', { name: `${name}.opcl` }), 'ok');
    } catch (error) {
      console.error('[OPCloud I/O] Export failed:', error);
      setStatus(t('exportFailed', { message: error.message }), 'error', 6000);
    }
  }

  function currentImageName() {
    const model = currentModel();
    const modelName = initService.modelService?.displayName || model.name || 'OPCloud-Model';
    const opdName = model.currentOpd?.name;
    return safeFileName(opdName ? `${modelName}-${opdName}` : modelName);
  }

  function exportJpeg() {
    try {
      const paper = initService?.paper;
      if (!paper || typeof paper.toJPEG !== 'function') {
        throw new Error(t('jpegUnsupported'));
      }
      const name = currentImageName();
      setStatus(t('generatingJpeg'), 'info', 0);
      paper.toJPEG((imageData) => {
        try {
          downloadBlob(jpegDataUrlToBlob(imageData), `${name}.jpeg`);
          setStatus(t('exported', { name: `${name}.jpeg` }), 'ok');
        } catch (error) {
          console.error('[OPCloud I/O] JPEG download failed:', error);
          setStatus(t('jpegExportFailed', { message: error.message }), 'error', 7000);
        }
      }, {
        padding: 40,
        useComputedStyles: false,
        size: '2x',
        quality: 1.0,
      });
    } catch (error) {
      console.error('[OPCloud I/O] JPEG export failed:', error);
      setStatus(t('jpegExportFailed', { message: error.message }), 'error', 7000);
    }
  }

  function exportSvg() {
    try {
      const paper = initService?.paper;
      if (!paper || typeof paper.toSVG !== 'function') {
        throw new Error(t('svgUnsupported'));
      }
      const name = currentImageName();
      setStatus(t('generatingSvg'), 'info', 0);
      paper.toSVG((imageData) => {
        try {
          const blob = new Blob([imageData], { type: 'image/svg+xml;charset=utf-8' });
          downloadBlob(blob, `${name}.svg`);
          setStatus(t('exported', { name: `${name}.svg` }), 'ok');
        } catch (error) {
          console.error('[OPCloud I/O] SVG download failed:', error);
          setStatus(t('svgExportFailed', { message: error.message }), 'error', 7000);
        }
      }, {
        useComputedStyles: false,
        convertImagesToDataUris: true,
      });
    } catch (error) {
      console.error('[OPCloud I/O] SVG export failed:', error);
      setStatus(t('svgExportFailed', { message: error.message }), 'error', 7000);
    }
  }

  function renderImageForBridge(format) {
    const paper = initService?.paper;
    const name = currentImageName();

    if (format === 'jpeg') {
      if (!paper || typeof paper.toJPEG !== 'function') {
        throw new Error(t('jpegUnsupported'));
      }
      return new Promise((resolve, reject) => {
        try {
          paper.toJPEG((imageData) => resolve({
            fileName: `${name}.jpeg`,
            mimeType: 'image/jpeg',
            dataBase64: dataUrlBase64(imageData),
          }), {
            padding: 40,
            useComputedStyles: false,
            size: '2x',
            quality: 1.0,
          });
        } catch (error) {
          reject(error);
        }
      });
    }

    if (format !== 'svg') throw new Error(t('unsupportedImageFormat', { format }));
    if (!paper || typeof paper.toSVG !== 'function') {
      throw new Error(t('svgUnsupported'));
    }
    return new Promise((resolve, reject) => {
      try {
        paper.toSVG((imageData) => resolve({
          fileName: `${name}.svg`,
          mimeType: 'image/svg+xml',
          dataBase64: bytesToBase64(new TextEncoder().encode(imageData)),
        }), {
          useComputedStyles: false,
          convertImagesToDataUris: true,
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function validateModel(json) {
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      throw new Error(t('fileNotJsonObject'));
    }
    if (!Array.isArray(json.opds) || !Array.isArray(json.logicalElements)) {
      throw new Error(t('missingModelFields'));
    }
    if (json.opds.length === 0) {
      throw new Error(t('modelHasNoOpd'));
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

  function generatedOpl() {
    if (!initService) throw new Error(t('notConnected'));
    if (typeof initService.modelService?.getOPL === 'function') {
      return initService.modelService.getOPL();
    }
    if (typeof initService.oplService?.generateOplTextOnly === 'function') {
      return initService.oplService.generateOplTextOnly()
        .filter((item) => item?.opl)
        .map((item) => String(item.opl).replace(/<\/?[^>]+>/g, '').trim())
        .join(' ');
    }
    throw new Error(t('oplUnsupported'));
  }

  async function handleBridgeAction(action, payload = {}) {
    if (action === 'status') {
      const model = initService ? currentModel() : null;
      return {
        ready: Boolean(initService),
        modelName: model?.name || initService?.modelService?.displayName || null,
        logicalElementCount: model?.logicalElements?.length || 0,
        opdCount: model?.opds?.length || 0,
        currentOpdName: model?.currentOpd?.name || null,
      };
    }

    if (!initService) throw new Error(t('pageNotReady'));
    if (action === 'getModel') {
      return { model: currentModel().toJson() };
    }
    if (action === 'importModel') {
      const json = validateModel(payload.model);
      const existing = currentModel();
      const hasContent = Array.isArray(existing.logicalElements) && existing.logicalElements.length > 0;
      if (hasContent && payload.replaceExisting !== true) {
        throw new Error(t('canvasNotEmptyAgent'));
      }
      renderImportedModel(json);
      setStatus(t('agentImported', { name: json.name || 'Imported Model' }), 'ok');
      return {
        imported: true,
        modelName: json.name || 'Imported Model',
        logicalElementCount: json.logicalElements.length,
        opdCount: json.opds.length,
      };
    }
    if (action === 'getOpl') {
      return { opl: generatedOpl() };
    }
    if (action === 'exportImage') {
      return renderImageForBridge(payload.format || 'svg');
    }
    if (action === 'reviewSnapshot') {
      const model = currentModel();
      const image = await renderImageForBridge('jpeg');
      return {
        modelSummary: {
          name: model.name || initService.modelService?.displayName || 'OPCloud Model',
          logicalElementCount: model.logicalElements?.length || 0,
          opdCount: model.opds?.length || 0,
          currentOpdName: model.currentOpd?.name || null,
        },
        opl: generatedOpl(),
        image,
      };
    }
    throw new Error(t('unknownAgentAction', { action }));
  }

  function sendBridgeMessage(message) {
    if (!bridgeSocket || bridgeSocket.readyState !== page.WebSocket.OPEN) return;
    bridgeSocket.send(JSON.stringify(message));
  }

  async function handleBridgeMessage(event) {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (message.type !== 'request' || !message.id || !message.action) return;

    try {
      const result = await handleBridgeAction(message.action, message.payload);
      sendBridgeMessage({ type: 'response', id: message.id, ok: true, result });
    } catch (error) {
      console.error(`[OPCloud Bridge] ${message.action} failed:`, error);
      sendBridgeMessage({
        type: 'response',
        id: message.id,
        ok: false,
        error: error?.message || String(error),
      });
    }
  }

  function scheduleBridgeReconnect() {
    window.clearTimeout(bridgeReconnectTimer);
    bridgeReconnectTimer = window.setTimeout(connectBridge, bridgeReconnectDelay);
    bridgeReconnectDelay = Math.min(bridgeReconnectDelay * 2, 10000);
  }

  function connectBridge() {
    if (bridgeSocket && [page.WebSocket.CONNECTING, page.WebSocket.OPEN].includes(bridgeSocket.readyState)) return;
    try {
      setBridgeStatus(t('bridgeConnecting'));
      bridgeSocket = new page.WebSocket(bridgeUrl());
      bridgeSocket.addEventListener('open', () => {
        bridgeReconnectDelay = 1000;
        setBridgeStatus(t('bridgeConnected'), 'ok');
        sendBridgeMessage({
          type: 'hello',
          pageUrl: page.location.href,
          userscriptVersion: USERSCRIPT_VERSION,
        });
      });
      bridgeSocket.addEventListener('message', handleBridgeMessage);
      bridgeSocket.addEventListener('close', () => {
        setBridgeStatus(t('bridgeWaiting'));
        scheduleBridgeReconnect();
      });
      bridgeSocket.addEventListener('error', () => {
        setBridgeStatus(t('bridgeWaiting'));
      });
    } catch (error) {
      console.debug('[OPCloud Bridge] Local connection unavailable:', error);
      setBridgeStatus(t('bridgeWaiting'));
      scheduleBridgeReconnect();
    }
  }

  async function importModel(file) {
    try {
      const text = (await file.text()).replace(/^\uFEFF/, '');
      const json = validateModel(JSON.parse(text));
      const existing = currentModel();
      const hasContent = Array.isArray(existing.logicalElements) && existing.logicalElements.length > 0;
      if (hasContent && !window.confirm(t('replaceConfirm'))) {
        setStatus(t('importCancelled'), 'info');
        return;
      }

      renderImportedModel(json);
      setStatus(t('imported', { name: json.name || file.name }), 'ok');
    } catch (error) {
      console.error('[OPCloud I/O] Import failed:', error);
      setStatus(t('importFailed', { message: error.message }), 'error', 7000);
    } finally {
      importInput.value = '';
    }
  }

  function refreshPanelLanguage() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    panel.lang = language === 'zh' ? 'zh-CN' : 'en';
    panel.querySelector('.opcloud-io-title-text').textContent = t('title');

    const languageButton = panel.querySelector('[data-action="language"]');
    languageButton.textContent = t('switchLanguage');
    languageButton.title = t('switchLanguageTitle');
    languageButton.setAttribute('aria-label', t('switchLanguageTitle'));

    const labels = {
      export: ['exportModel', null],
      import: ['importModel', null],
      jpeg: ['exportJpeg', 'exportJpegTitle'],
      svg: ['exportSvg', 'exportSvgTitle'],
    };
    Object.entries(labels).forEach(([action, [labelKey, titleKey]]) => {
      const button = panel.querySelector(`[data-action="${action}"]`);
      button.textContent = t(labelKey);
      if (titleKey) button.title = t(titleKey);
    });

    setStatus(initService ? t('connected') : t('connecting'), initService ? 'ok' : 'info', 0);
    if (bridgeSocket?.readyState === page.WebSocket.OPEN) {
      setBridgeStatus(t('bridgeConnected'), 'ok');
    } else if (bridgeSocket?.readyState === page.WebSocket.CONNECTING) {
      setBridgeStatus(t('bridgeConnecting'));
    } else {
      setBridgeStatus(t('bridgeWaiting'));
    }
  }

  function toggleLanguage() {
    language = language === 'zh' ? 'en' : 'zh';
    try {
      page.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // The current page can still switch language without persistent storage.
    }
    refreshPanelLanguage();
  }

  function createPanel() {
    if (document.getElementById(PANEL_ID)) return;

    const style = document.createElement('style');
    style.textContent = `
      #${PANEL_ID} {
        position: fixed; right: 14px; top: auto; bottom: 14px; z-index: 2147483646;
        width: 230px; padding: 10px; box-sizing: border-box;
        border: 1px solid rgba(26,55,99,.24); border-radius: 9px;
        background: rgba(255,255,255,.96); color: #1a3763;
        box-shadow: 0 5px 20px rgba(26,55,99,.18);
        font: 13px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #${PANEL_ID} .opcloud-io-title {
        display: flex; align-items: center; justify-content: space-between;
        gap: 8px; font-weight: 700; margin-bottom: 8px;
      }
      #${PANEL_ID} .opcloud-io-language {
        flex: 0 0 auto; padding: 2px 6px; border: 1px solid rgba(26,55,99,.24);
        background: transparent; color: #497284; font-size: 11px; line-height: 1.3;
      }
      #${PANEL_ID} .opcloud-io-language:hover { background: rgba(73,114,132,.1); }
      #${PANEL_ID} .opcloud-io-actions {
        display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px;
      }
      #${PANEL_ID} button {
        padding: 7px 9px; border: 0; border-radius: 6px;
        background: #497284; color: white; cursor: pointer; font: inherit;
      }
      #${PANEL_ID} button:hover { background: #365d70; }
      #${PANEL_ID} button:disabled { opacity: .45; cursor: wait; }
      #${PANEL_ID}-status { margin-top: 7px; min-height: 18px; font-size: 12px; color: #607080; }
      #${PANEL_ID}-status[data-kind="ok"] { color: #247344; }
      #${PANEL_ID}-status[data-kind="error"] { color: #b42318; }
      #${PANEL_ID}-bridge-status { margin-top: 2px; font-size: 11px; color: #788792; }
      #${PANEL_ID}-bridge-status[data-kind="ok"] { color: #247344; }
    `;
    document.head.appendChild(style);

    const panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="opcloud-io-title">
        <span class="opcloud-io-title-text">${t('title')}</span>
        <button class="opcloud-io-language" type="button" data-action="language"
          title="${t('switchLanguageTitle')}" aria-label="${t('switchLanguageTitle')}">${t('switchLanguage')}</button>
      </div>
      <div class="opcloud-io-actions">
        <button type="button" data-action="export" disabled>${t('exportModel')}</button>
        <button type="button" data-action="import" disabled>${t('importModel')}</button>
        <button type="button" data-action="jpeg" title="${t('exportJpegTitle')}" disabled>${t('exportJpeg')}</button>
        <button type="button" data-action="svg" title="${t('exportSvgTitle')}" disabled>${t('exportSvg')}</button>
      </div>
      <div id="${PANEL_ID}-status" data-kind="info">${t('connecting')}</div>
      <div id="${PANEL_ID}-bridge-status" data-kind="info">${t('bridgeWaiting')}</div>
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
    panel.querySelector('[data-action="jpeg"]').addEventListener('click', exportJpeg);
    panel.querySelector('[data-action="svg"]').addEventListener('click', exportSvg);
    panel.querySelector('[data-action="language"]').addEventListener('click', toggleLanguage);
    refreshPanelLanguage();
  }

  createPanel();
  connect();
  connectBridge();
})();
