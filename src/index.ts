#!/usr/bin/env node

/**
 * Missive MCP Server
 *
 * An MCP server that interfaces with the Missive API for email management.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getClient } from './client.js';
import { registerReferenceTools } from './tools/reference.js';
import { registerConversationTools } from './tools/conversations.js';
import { registerMessageTools } from './tools/messages.js';
import { registerDraftTools } from './tools/drafts.js';
import { registerContactTools } from './tools/contacts.js';
import { registerManagementTools } from './tools/management.js';

async function main() {
  // Validate token on startup (fail fast)
  try {
    getClient();
  } catch (error) {
    console.error(
      'Failed to initialize Missive client:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    process.exit(1);
  }

  const server = new McpServer({
    name: 'missive-mcp',
    version: '1.0.0',
  });

  // Register all tools
  registerReferenceTools(server);
  registerConversationTools(server);
  registerMessageTools(server);
  registerDraftTools(server);
  registerContactTools(server);
  registerManagementTools(server);

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Fatal error:', error instanceof Error ? error.message : error);
  process.exit(1);
});
