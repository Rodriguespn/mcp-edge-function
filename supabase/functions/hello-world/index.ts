// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
// Minimal hello-world Supabase Edge Function without external deps

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

// Helper function to format query results as HTML table
function formatResultsAsTable(data: Record<string, unknown>[]): string {
  if (!data || data.length === 0) {
    return `<div class="sql-results" style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; background: #1c1c1c;">
      <p style="color: #b4b4b4; font-style: italic; padding: 16px; background: #181818; border: 1px solid #2e2e2e; border-radius: 6px; text-align: center;">No results found</p>
    </div>`;
  }

  const columns = Object.keys(data[0]);
  
  return `
    <div class="sql-results" style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; background: #1c1c1c;">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
        
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

mcp.tool("run_crud_sql", {
  description: "Execute SELECT queries on Supabase tables and return results as a formatted HTML table. Supports filtering and limiting results with RLS (Row Level Security) enforcement.",
  inputSchema: QueryInputSchema,
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

      // Create UI resource with the HTML table
      const uiResource = createUIResource({
        uri: `ui://supabase/${args.table}/query-results`,
        content: {
          type: 'rawHtml',
          htmlString: tableHtml,
        },
        encoding: 'text',
      });

      // Return both text summary and UI resource
      return { 
        content: [
          {
            type: "text",
            text: `Query returned ${results?.length || 0} row${results?.length !== 1 ? 's' : ''} from table '${args.table}'.`,
          },
          uiResource as unknown as { type: "text"; text: string },
        ],
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
