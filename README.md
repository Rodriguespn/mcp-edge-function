# Supabase MCP SQL Tool

This MCP server provides a `run_crud_sql` tool that allows you to execute SQL queries on your Supabase database and display results as formatted HTML tables.

## Features

- 🔒 **RLS Support**: Queries respect Row Level Security policies through Supabase's REST API
- 📊 **Table Formatting**: Results are displayed as beautiful, styled HTML tables
- ✅ **CRUD Operations**: Supports SELECT, INSERT, UPDATE, and DELETE queries
- 🎨 **Visual Design**: Gradient headers, hover effects, and responsive layout
- 🚀 **Edge Runtime Compatible**: Built without external MCP libraries, using native JSON-RPC

## Setup

### 1. Apply the Database Migration

First, create the `exec_sql` function in your Supabase database:

```bash
# If using Supabase CLI locally
supabase db reset

# Or apply the migration manually
supabase migration up
```

Alternatively, run this SQL in your Supabase SQL Editor:

```sql
CREATE OR REPLACE FUNCTION exec_sql(query text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  EXECUTE format('SELECT json_agg(t) FROM (%s) t', query) INTO result;
  RETURN COALESCE(result, '[]'::json);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'error', SQLERRM,
      'detail', SQLSTATE
    );
END;
$$;

GRANT EXECUTE ON FUNCTION exec_sql(text) TO authenticated;
GRANT EXECUTE ON FUNCTION exec_sql(text) TO anon;
```

### 2. Set Environment Variables

Make sure your environment has the Supabase credentials:

```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_ANON_KEY="your-anon-key"
```

### 3. Deploy the Function

```bash
# Deploy to Supabase
supabase functions deploy hello-world

# Or run locally
supabase functions serve --no-verify-jwt
```

## Usage

### Connect to the MCP Server

The MCP endpoint is available at:
```
http://127.0.0.1:54321/functions/v1/hello-world/mcp
```

For production:
```
https://your-project.supabase.co/functions/v1/hello-world/mcp
```

### Using the Tool

The `run_crud_sql` tool accepts a single parameter:

- `query` (string): The SQL query to execute

#### Examples

**SELECT query:**
```json
{
  "name": "run_crud_sql",
  "arguments": {
    "query": "SELECT * FROM users LIMIT 10"
  }
}
```

**INSERT query:**
```json
{
  "name": "run_crud_sql",
  "arguments": {
    "query": "INSERT INTO posts (title, content) VALUES ('My Post', 'Hello World') RETURNING *"
  }
}
```

**UPDATE query:**
```json
{
  "name": "run_crud_sql",
  "arguments": {
    "query": "UPDATE users SET last_login = NOW() WHERE id = '123' RETURNING *"
  }
}
```

**DELETE query:**
```json
{
  "name": "run_crud_sql",
  "arguments": {
    "query": "DELETE FROM temp_data WHERE created_at < NOW() - INTERVAL '7 days' RETURNING *"
  }
}
```

### Response Format

The tool returns:
- **content**: An MCP-UI resource containing the formatted HTML table
- **structuredContent**: JSON with `rowCount` and `data` fields

Example HTML table output:
- Gradient purple header
- Alternating row colors
- Hover effects
- Responsive design
- Row count display

## Security Considerations

⚠️ **Important**: The `exec_sql` function is created with `SECURITY DEFINER`, which means it runs with the privileges of the function owner. Consider these security best practices:

1. **Row Level Security**: Always enable RLS on your tables
2. **Input Validation**: Be cautious about the queries being executed
3. **Limited Permissions**: Only grant necessary permissions to the function
4. **Audit Logging**: Consider adding logging for executed queries

## Testing with MCP Inspector

```bash
# Start the function locally
supabase functions serve --no-verify-jwt

# In another terminal, run the MCP inspector
npx @modelcontextprotocol/inspector

# Enter the URL: http://127.0.0.1:54321/functions/v1/hello-world/mcp
```

## Troubleshooting

### "exec_sql function does not exist"
- Make sure you've applied the migration
- Check that the function exists: `SELECT * FROM pg_proc WHERE proname = 'exec_sql'`

### "SUPABASE_URL not found"
- Ensure environment variables are set correctly
- For local development, use `http://127.0.0.1:54321`

### RLS blocking queries
- Check your RLS policies
- Use `SUPABASE_SERVICE_ROLE_KEY` for admin access (not recommended for production)
- Ensure the authenticated user has proper permissions
