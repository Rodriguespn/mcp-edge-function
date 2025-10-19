// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
// MCP server with SQL execution tool and OpenAI Apps SDK support

/**
 * OpenAI Apps SDK Integration:
 * 
 * This code is adapted to work with both:
 * 1. MCP-native hosts (using embedded UI resources)
 * 2. OpenAI ChatGPT (using Apps SDK with templates and structured content)
 * 
 * Key components:
 * - _appsSdkTemplate: Template resource with Apps SDK adapter enabled
 * - Tool _meta: Contains OpenAI-specific metadata (outputTemplate, toolInvocation, etc.)
 * - structuredContent: Data payload for Apps SDK rendering
 * - Embedded UI resource: Standard MCP-UI resource (no adapter) for native hosts
 * 
 * The Apps SDK adapter automatically:
 * - Changes MIME type to text/html+skybridge
 * - Injects bridge script to translate postMessage to window.openai APIs
 * - Handles bidirectional communication transparently
 */

// MCP server with SQL execution tool

import { Hono } from "hono";
import { McpServer, StreamableHttpTransport } from "mcp-lite";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { createClient } from "@supabase/supabase-js";
import { createUIResource } from "@mcp-ui/server";

const mcp = new McpServer({
  name: "supabase-sql-server",
  version: "1.0.0",
  schemaAdapter: (schema: unknown) => zodToJsonSchema(schema as z.ZodType),
});

// Template URI for Apps SDK
const TEMPLATE_URI = 'ui://supabase/select/template';

// Helper function to create the Apps SDK template with dynamic render data support
function createAppsSdkTemplate(): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: transparent;
          color: #ededed;
          padding: 20px;
        }
        .sql-results {
          width: 100%;
          max-width: 100%;
        }
        .loading {
          color: #b4b4b4;
          padding: 16px;
          text-align: center;
        }
        .no-results {
          color: #b4b4b4;
          font-style: italic;
          padding: 16px;
          background: #181818;
          border: 1px solid #2e2e2e;
          border-radius: 6px;
          text-align: center;
        }
        .query-info {
          color: #b4b4b4;
          font-size: 12px;
          margin-bottom: 12px;
          padding: 8px 12px;
          background: #181818;
          border: 1px solid #2e2e2e;
          border-radius: 6px;
        }
        .query-info strong {
          color: #ededed;
        }
        .sql-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          margin-top: 12px;
          background: #181818;
          border: 1px solid #2e2e2e;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
        }
        .sql-table th {
          background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
          color: #ededed;
          padding: 12px 16px;
          text-align: left;
          font-weight: 500;
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 1px solid #2e2e2e;
        }
        .sql-table td {
          padding: 12px 16px;
          border-bottom: 1px solid #2e2e2e;
          font-size: 14px;
          color: #b4b4b4;
          background: #181818;
        }
        .sql-table tbody tr:hover td {
          background: #1f1f1f;
        }
        .sql-table tbody tr:last-child td {
          border-bottom: none;
        }
        .results-info {
          color: #ededed;
          font-size: 13px;
          margin-bottom: 12px;
          padding: 8px 12px;
          background: #181818;
          border: 1px solid #2e2e2e;
          border-radius: 6px;
          display: inline-block;
        }
        .results-info strong {
          color: #3ecf8e;
          font-weight: 600;
        }
      </style>
    </head>
    <body>
      <div class="sql-results">
        <div id="content" class="loading">Loading query results...</div>
      </div>
      
      <script>
        function escapeHtml(text) {
          const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
          };
          return String(text).replace(/[&<>"']/g, m => map[m]);
        }

        function renderTable(data, toolInput) {
          const contentDiv = document.getElementById('content');
          
          if (!data || data.length === 0) {
            contentDiv.innerHTML = \`
              <div class="query-info">
                <strong>Table:</strong> \${escapeHtml(toolInput.table || 'unknown')}<br>
                <strong>Filter:</strong> \${toolInput.filter ? escapeHtml(JSON.stringify(toolInput.filter)) : 'none'}
              </div>
              <div class="no-results">No results found</div>
              <div class="table-name"><strong>Table:</strong> \${escapeHtml(toolInput.table || 'unknown')}</div>
            \`;
            return;
          }

          const columns = Object.keys(data[0]);
          
          contentDiv.innerHTML = \`
            <div class="query-info">
              <strong>Table:</strong> \${escapeHtml(toolInput.table || 'unknown')}<br>
              <strong>Columns:</strong> \${escapeHtml(toolInput.columns || '*')}<br>
              \${toolInput.filter ? '<strong>Filter:</strong> ' + escapeHtml(JSON.stringify(toolInput.filter)) + '<br>' : ''}
              \${toolInput.limit ? '<strong>Limit:</strong> ' + toolInput.limit : ''}
            </div>
            <div class="results-info">
              <strong>\${data.length}</strong> row\${data.length !== 1 ? 's' : ''} returned
            </div>
            <table class="sql-table">
              <thead>
                <tr>
                  \${columns.map(col => \`<th>\${escapeHtml(col)}</th>\`).join('')}
                </tr>
              </thead>
              <tbody>
                \${data.map(row => \`
                  <tr>
                    \${columns.map(col => \`<td>\${escapeHtml(row[col] ?? 'NULL')}</td>\`).join('')}
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          \`;
        }

        // Listen for render data from Apps SDK
        window.addEventListener('message', (event) => {
          if (event.data.type === 'ui-lifecycle-iframe-render-data') {
            const { renderData } = event.data.payload;
            const { toolInput, toolOutput } = renderData;
            
            // Extract results from structuredContent
            const results = toolOutput?.results || [];
            
            // Render the table with the data
            renderTable(results, toolInput || {});
          }
        });
        
        // Request render data from Apps SDK
        window.parent.postMessage({
          type: 'ui-request-render-data'
        }, '*');
      </script>
    </body>
    </html>
  `;
}

// Helper function to format query results as HTML table (for MCP-UI hosts)
function formatResultsAsTable(data: Record<string, unknown>[] | null): string {
  if (!data || data.length === 0) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #1c1c1c;
          color: #ededed;
          padding: 20px;
        }
        .no-results {
          color: #b4b4b4;
          font-style: italic;
          padding: 16px;
          background: #181818;
          border: 1px solid #2e2e2e;
          border-radius: 6px;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div class="sql-results">
        <p class="no-results">0 result</p>
      </div>
    </body>
    </html>`;
  }

  const columns = Object.keys(data[0]);
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #1c1c1c;
          color: #ededed;
          padding: 20px;
        }
        .sql-results {
          width: 100%;
          max-width: 100%;
        }
        .sql-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          margin-top: 12px;
          background: #181818;
          border: 1px solid #2e2e2e;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
        }
        .sql-table th {
          background: #1a1a1a;
          color: #ededed;
          padding: 12px 16px;
          text-align: left;
          font-weight: 500;
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 1px solid #2e2e2e;
        }
        .sql-table td {
          padding: 12px 16px;
          border-bottom: 1px solid #2e2e2e;
          font-size: 14px;
          color: #b4b4b4;
          background: #181818;
        }
        .sql-table tbody tr:hover td {
          background: #1f1f1f;
        }
        .sql-table tbody tr:last-child td {
          border-bottom: none;
        }
        .results-info {
          color: #ededed;
          font-size: 13px;
          margin-bottom: 12px;
          padding: 8px 12px;
          background: #181818;
          border: 1px solid #2e2e2e;
          border-radius: 6px;
          display: inline-block;
        }
        .results-info strong {
          color: #3ecf8e;
          font-weight: 600;
        }
      </style>
    </head>
    <body>
      <div class="sql-results">
        <div class="results-info">
          <strong>${data.length}</strong> row${data.length !== 1 ? 's' : ''} returned
        </div>
        <table class="sql-table">
          <thead>
            <tr>
              ${columns.map(col => `<th>${escapeHtml(col)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${data.map(row => `
              <tr>
                ${columns.map(col => `<td>${escapeHtml(String(row[col] ?? 'NULL'))}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </body>
    </html>
  `;
}

// Helper function to escape HTML
function escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

// Query tool using Supabase REST API - SELECT only
const QueryInputSchema = z.object({ 
  table: z.string().describe("Table name to query"),
  columns: z.string().optional().describe("Columns to select (comma-separated, e.g., 'id,name,email'). Use '*' for all columns."),
  filter: z.record(z.any()).optional().describe("Filter conditions as key-value pairs (e.g., {id: 1, status: 'active'})."),
  limit: z.number().optional().describe("Maximum number of rows to return."),
});

type QueryInput = z.infer<typeof QueryInputSchema>;

// Create the Apps SDK template resource with dynamic render data support
const _appsSdkTemplate = createUIResource({
  uri: TEMPLATE_URI,
  encoding: 'text',
  adapters: {
    appsSdk: {
      enabled: true,
      config: { 
        intentHandling: 'prompt',
        timeout: 30000
      }
    }
  },
  content: {
    type: 'rawHtml',
    htmlString: createAppsSdkTemplate()
  },
  metadata: {
    'openai/widgetDescription': 'Interactive SQL query results table with dynamic data rendering',
    'openai/widgetPrefersBorder': true,
    'openai/widgetCSP': {
      connect_domains: [],
      resource_domains: ['fonts.googleapis.com', 'fonts.gstatic.com']
    }
  }
});

mcp.tool("run_crud_sql", {
  description: "Execute SELECT queries on Supabase tables and return results as a formatted HTML table. Supports filtering and limiting results with RLS (Row Level Security) enforcement.",
  inputSchema: QueryInputSchema,
  _meta: {
    'openai/outputTemplate': TEMPLATE_URI,
    'openai/toolInvocation/invoking': 'Executing SQL query...',
    'openai/toolInvocation/invoked': 'Query complete',
    'openai/widgetAccessible': true
  },
  handler: async (args: QueryInput) => {
    try {
      // Get Supabase credentials from environment
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY");

      if (!supabaseUrl || !supabaseKey) {
        return {
          content: [{
            type: "text",
            text: "Error: Supabase credentials not found. Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables."
          }],
          isError: true,
        };
      }

      // Create Supabase client
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Execute SELECT query
      let query = supabase.from(args.table).select(args.columns || "*");
      
      // Apply filters if provided
      if (args.filter) {
        for (const [key, value] of Object.entries(args.filter)) {
          query = query.eq(key, value);
        }
      }
      
      // Apply limit if provided
      if (args.limit) {
        query = query.limit(args.limit);
      }
      
      const { data, error } = await query;

      if (error) {
        return {
          content: [{
            type: "text",
            text: `Database Error: ${error.message}`
          }],
          isError: true,
        };
      }

      // Get results and format as HTML table
      const results = data as unknown as Record<string, unknown>[];
      const tableHtml = formatResultsAsTable(results);

      // Create MCP-UI embedded resource (NO adapter - for MCP-native hosts)
      const uiResource = createUIResource({
        uri: `ui://supabase/${args.table}/select`,
        content: {
          type: 'rawHtml',
          htmlString: tableHtml,
        },
        encoding: 'text',
        // NO adapters property - this is for MCP-native hosts only
      });

      // Return both text summary, UI resource, and structured content
      return { 
        content: [
          {
            type: "text",
            text: `Query returned ${results?.length || 0} row${results?.length !== 1 ? 's' : ''} from table '${args.table}'.`,
          },
          uiResource as unknown as { type: "text"; text: string },
        ],
        // Apps SDK structured content for ChatGPT
        structuredContent: {
          results: results,
          rowCount: results?.length || 0,
          tableName: args.table,
          columns: args.columns || "*",
          filter: args.filter,
        }
      };
    } catch (err) {
      return {
        content: [{
          type: "text",
          text: `Error executing operation: ${err instanceof Error ? err.message : String(err)}`
        }],
        isError: true,
      };
    }
  },
});

// Register the Apps SDK template as an MCP resource
mcp.resource(
  TEMPLATE_URI,
  {
    description: 'Template for SQL query results display with Apps SDK support',
    mimeType: _appsSdkTemplate.resource.mimeType as string,
  },
  () => Promise.resolve({
    contents: [{
      type: 'text' as const,
      uri: _appsSdkTemplate.resource.uri,
      mimeType: _appsSdkTemplate.resource.mimeType as string,
      text: _appsSdkTemplate.resource.text || '',
    }],
  })
);

const transport = new StreamableHttpTransport();
const httpHandler = transport.bind(mcp);

const app = new Hono();


// Create a sub-app for /hello-world
const helloWorld = new Hono();

helloWorld.post("/", (c: { json: (data: { message: string }) => Response }) => {
  return c.json({ message: "Hello from Hono on Deno Edge!" });
});

helloWorld.all("/mcp", async (c: { req: { raw: Request } }) => {
  const response = await httpHandler(c.req.raw);
  return response;
});

// Mount the sub-app at /hello-world
app.route("/hello-world", helloWorld);

export default app;


/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/hello-world' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
