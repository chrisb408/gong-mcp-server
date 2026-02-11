# Gong MCP Server

An MCP (Model Context Protocol) server that connects Claude to your Gong data. Query calls, transcripts, deals, emails, and user activity directly from Claude.

## Features

| Tool | Description |
|------|-------------|
| `gong_list_calls` | List recent calls with date filters |
| `gong_get_call_details` | Get detailed call info including CRM context and topics |
| `gong_get_transcript` | Get full call transcript with speaker identification |
| `gong_list_users` | List all users in workspace |
| `gong_get_user_stats` | Get activity statistics for users |
| `gong_get_calls_for_account` | Get all calls for a CRM account/deal |
| `gong_list_deals` | List deals synced from CRM |
| `gong_list_emails` | List captured emails |
| `gong_list_library_folders` | List saved call collections |

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Build

```bash
npm run build
```

### 3. Add to Claude Code

```bash
claude mcp add gong node ~/projects/gong-mcp-server/dist/index.js \
  -e GONG_ACCESS_KEY=your_key \
  -e GONG_ACCESS_KEY_SECRET=your_secret
```

## Example Queries

Once connected, you can ask Claude things like:

- "Show me all calls from last week"
- "Get the transcript from call ID abc123"
- "What calls has the Acme account had in Q4?"
- "List all deals in stage 'Negotiation'"

## License

MIT
