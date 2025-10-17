// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
// Minimal hello-world Supabase Edge Function without external deps

// Minimal MCP server using mcp-lite with a hello_world tool



import { Hono } from "npm:hono";
import { McpServer, StreamableHttpTransport } from "npm:mcp-lite";
import { z } from "npm:zod";

const mcp = new McpServer({
  name: "example-server",
  version: "1.0.0",
  schemaAdapter: (schema) => z.toJSONSchema(schema as z.ZodType),
});

const WeatherInputSchema = z.object({
  location: z.string(),
});

const WeatherOutputSchema = z.object({
  temperature: z.number(),
  conditions: z.string(),
});

mcp.tool("getWeather", {
  description: "Gets weather information for a location",
  inputSchema: WeatherInputSchema,
  outputSchema: WeatherOutputSchema,
  handler: (args) => ({
    content: [{
      type: "text",
      text: `Weather in ${args.location}: 22°C, sunny`
    }],
    structuredContent: {
      temperature: 22,
      conditions: "sunny",
    },
  }),
});

const transport = new StreamableHttpTransport();
const httpHandler = transport.bind(mcp);

const app = new Hono();


// Create a sub-app for /hello-world
const helloWorld = new Hono();

helloWorld.post("/", (c) => {
  return c.json({ message: "Hello from Hono on Deno Edge!" });
});

helloWorld.all("/mcp", async (c) => {
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
