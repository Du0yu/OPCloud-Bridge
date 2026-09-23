#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { SharedBridge } from './shared-bridge.js';
import { validateOpcloudModel } from './model-validation.js';
import { MODELING_INSTRUCTIONS, getModelingGuide, getModelTemplate } from './modeling-guide.js';

const port = Number.parseInt(process.env.OPCLOUD_BRIDGE_PORT || '17373', 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('OPCLOUD_BRIDGE_PORT must be a valid TCP port.');
  process.exit(1);
}

const bridge = new SharedBridge({ port });

const server = new McpServer({
  name: 'opcloud-bridge',
  version: '1.7.1',
}, { instructions: MODELING_INSTRUCTIONS });

function textResult(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: 'text', text }] };
}

function errorResult(error) {
  return {
    content: [{ type: 'text', text: `OPCloud Bridge error: ${error.message}` }],
    isError: true,
  };
}

function assertImagePayload(image, expectedMimeType = null) {
  if (!image?.dataBase64 || !image?.mimeType || !image?.fileName) {
    throw new Error('OPCloud returned an incomplete image payload.');
  }
  if (expectedMimeType && image.mimeType !== expectedMimeType) {
    throw new Error(`OPCloud returned ${image.mimeType}; expected ${expectedMimeType}.`);
  }

  const bytes = Buffer.from(image.dataBase64, 'base64');
  if (image.mimeType === 'image/jpeg') {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      throw new Error('OPCloud returned invalid JPEG data.');
    }
  } else if (image.mimeType === 'image/svg+xml') {
    if (!bytes.toString('utf8').includes('<svg')) {
      throw new Error('OPCloud returned invalid SVG data.');
    }
  }
  return image;
}

function registerTool(name, definition, handler) {
  server.registerTool(name, { inputSchema: {}, ...definition }, async (args, extra) => {
    try {
      return await handler(args, extra.signal);
    } catch (error) {
      return errorResult(error);
    }
  });
}

registerTool('opcloud_get_modeling_guide', {
  title: 'Read OPCloud modeling rules',
  description: 'Read this before creating or modifying an OPCloud model. Returns the repository AGENTS.md rules, supported native element/link types, and validation limits. Available without a browser connection. Then call opcloud_get_model_template for complete export structures.',
  annotations: { readOnlyHint: true, openWorldHint: false },
}, async () => textResult(await getModelingGuide()));

registerTool('opcloud_get_model_template', {
  title: 'Read the complete native OPCloud template',
  description: 'Read this after opcloud_get_modeling_guide and before generating a model. Returns the complete canonical Two-Dish Dinner OPCL export, including all metadata and native element/relation structures. Clone the relevant structures, preserve unknown fields, replace domain content, and generate fresh UUIDs for new elements. Available offline.',
  annotations: { readOnlyHint: true, openWorldHint: false },
}, async () => textResult(JSON.stringify(await getModelTemplate())));

registerTool('opcloud_status', {
  title: 'OPCloud connection status',
  description: 'Check whether the OPCloud browser tab and userscript are connected to the local bridge.',
}, async (_, signal) => {
  const localStatus = await bridge.status(signal);
  if (!localStatus.connected) return textResult(localStatus);
  const browserStatus = await bridge.call('status', {}, 30000, signal);
  return textResult({ ...localStatus, opcloud: browserStatus });
});

registerTool('opcloud_get_model', {
  title: 'Read current OPCloud model',
  description: 'Return the complete JSON serialization of the model currently open in OPCloud.',
}, async (_, signal) => {
  const result = await bridge.call('getModel', {}, 30000, signal);
  return textResult(result.model);
});

registerTool('opcloud_import_model', {
  title: 'Import an OPCloud model',
  description: 'Load a complete OPCloud JSON/OPCL model into the open browser tab. Before generating it, read opcloud_get_modeling_guide and opcloud_get_model_template; preserve the current model and run opcloud_validate_model. Set replaceExisting=true only to intentionally replace a non-empty canvas. After import, call opcloud_review_diagram and check its OPL and JPEG.',
  inputSchema: {
    model: z.record(z.string(), z.unknown()).describe('Complete parsed OPCloud model object.'),
    replaceExisting: z.boolean().default(false).describe('Explicitly allow replacing an existing non-empty model.'),
  },
}, async ({ model, replaceExisting }, signal) => {
  const validation = validateOpcloudModel(model);
  if (!validation.valid) {
    throw new Error(`Model validation failed: ${validation.errors.join(' ')}`);
  }
  const result = await bridge.call('importModel', { model, replaceExisting }, 30000, signal);
  return textResult({ ...result, validation });
});

registerTool('opcloud_get_opl', {
  title: 'Read generated OPL',
  description: 'Generate and return the OPL sentences for the current OPCloud model.',
}, async (_, signal) => {
  const result = await bridge.call('getOpl', {}, 60000, signal);
  return textResult(result.opl);
});

registerTool('opcloud_validate_model', {
  title: 'Validate an OPCloud model',
  description: 'Check native structure, supported links, state ownership and bridge-profile Effect state evidence. Read opcloud_get_modeling_guide before generation. Inspect warnings and semanticChecks even when valid is true: human Agent identity and meaningful state changes require review. Omit model to read the browser model. isoConformance remains not_assessed; this tool does not verify rendering, full semantics, OPL or ISO compliance.',
  inputSchema: {
    model: z.record(z.string(), z.unknown()).optional().describe('Optional complete model object. Omit to validate the browser model.'),
  },
}, async ({ model }, signal) => {
  let target = model;
  if (!target) target = (await bridge.call('getModel', {}, 30000, signal)).model;
  return textResult(validateOpcloudModel(target));
});

registerTool('opcloud_export_image', {
  title: 'Export the current OPD image',
  description: 'Render the current OPD as JPEG or SVG and return it as MCP image content.',
  inputSchema: {
    format: z.enum(['jpeg', 'svg']).default('jpeg'),
  },
}, async ({ format }, signal) => {
  const result = assertImagePayload(await bridge.call('exportImage', { format }, 60000, signal));
  return {
    content: [
      { type: 'text', text: result.fileName },
      { type: 'image', data: result.dataBase64, mimeType: result.mimeType },
    ],
  };
});

registerTool('opcloud_review_diagram', {
  title: 'Review the current OPCloud diagram',
  description: 'Return a closed-loop review snapshot containing the current model summary, generated OPL, and the actual current OPD rendered as a JPEG image. Use this after importing or editing a model so the Agent can visually inspect the result.',
}, async (_, signal) => {
  const result = await bridge.call('reviewSnapshot', {}, 60000, signal);
  assertImagePayload(result.image, 'image/jpeg');
  const reviewText = JSON.stringify({
    modelSummary: result.modelSummary,
    opl: result.opl,
    imageFileName: result.image.fileName,
  }, null, 2);
  return {
    content: [
      { type: 'text', text: reviewText },
      {
        type: 'image',
        data: result.image.dataBase64,
        mimeType: result.image.mimeType,
      },
    ],
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
// Tool discovery must not depend on the browser or the shared daemon being ready.
const reconnect = setInterval(() => {
  void bridge.connect().catch(() => {});
}, 2000);
void bridge.connect().catch((error) => console.error(`[OPCloud Bridge] ${error.message}`));

async function shutdown() {
  clearInterval(reconnect);
  await bridge.close();
  process.exit(0);
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
process.stdin.once('end', shutdown);
