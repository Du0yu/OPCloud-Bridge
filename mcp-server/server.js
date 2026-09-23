#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { SharedBridge } from './shared-bridge.js';
import { validateOpcloudModel } from './model-validation.js';

const port = Number.parseInt(process.env.OPCLOUD_BRIDGE_PORT || '17373', 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('OPCLOUD_BRIDGE_PORT must be a valid TCP port.');
  process.exit(1);
}

const bridge = new SharedBridge({ port });

const server = new McpServer({
  name: 'opcloud-bridge',
  version: '1.6.0',
});

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
  server.registerTool(name, definition, async (args) => {
    try {
      return await handler(args);
    } catch (error) {
      return errorResult(error);
    }
  });
}

registerTool('opcloud_status', {
  title: 'OPCloud connection status',
  description: 'Check whether the OPCloud browser tab and userscript are connected to the local bridge.',
}, async () => {
  const localStatus = await bridge.status();
  if (!localStatus.connected) return textResult(localStatus);
  const browserStatus = await bridge.call('status');
  return textResult({ ...localStatus, opcloud: browserStatus });
});

registerTool('opcloud_get_model', {
  title: 'Read current OPCloud model',
  description: 'Return the complete JSON serialization of the model currently open in OPCloud.',
}, async () => {
  const result = await bridge.call('getModel');
  return textResult(result.model);
});

registerTool('opcloud_import_model', {
  title: 'Import an OPCloud model',
  description: 'Load a complete OPCloud JSON/OPCL model into the open browser tab. Set replaceExisting=true to explicitly authorize replacing a non-empty canvas.',
  inputSchema: {
    model: z.record(z.string(), z.unknown()).describe('Complete parsed OPCloud model object.'),
    replaceExisting: z.boolean().default(false).describe('Explicitly allow replacing an existing non-empty model.'),
  },
}, async ({ model, replaceExisting }) => {
  const validation = validateOpcloudModel(model);
  if (!validation.valid) {
    throw new Error(`Model validation failed: ${validation.errors.join(' ')}`);
  }
  const result = await bridge.call('importModel', { model, replaceExisting });
  return textResult({ ...result, validation });
});

registerTool('opcloud_get_opl', {
  title: 'Read generated OPL',
  description: 'Generate and return the OPL sentences for the current OPCloud model.',
}, async () => {
  const result = await bridge.call('getOpl', {}, 60000);
  return textResult(result.opl);
});

registerTool('opcloud_validate_model', {
  title: 'Validate an OPCloud model',
  description: 'Validate an supplied model, or validate the model currently open in OPCloud when model is omitted.',
  inputSchema: {
    model: z.record(z.string(), z.unknown()).optional().describe('Optional complete model object. Omit to validate the browser model.'),
  },
}, async ({ model }) => {
  let target = model;
  if (!target) target = (await bridge.call('getModel')).model;
  return textResult(validateOpcloudModel(target));
});

registerTool('opcloud_export_image', {
  title: 'Export the current OPD image',
  description: 'Render the current OPD as JPEG or SVG and return it as MCP image content.',
  inputSchema: {
    format: z.enum(['jpeg', 'svg']).default('jpeg'),
  },
}, async ({ format }) => {
  const result = assertImagePayload(await bridge.call('exportImage', { format }, 60000));
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
}, async () => {
  const result = await bridge.call('reviewSnapshot', {}, 60000);
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
