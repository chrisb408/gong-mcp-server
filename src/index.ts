#!/usr/bin/env node

/**
 * Gong MCP Server
 *
 * Exposes Gong's conversation intelligence data through the Model Context Protocol.
 * Query calls, transcripts, deals, emails, and user activity.
 *
 * Environment variables:
 *   GONG_ACCESS_KEY - Your Gong API access key
 *   GONG_ACCESS_KEY_SECRET - Your Gong API access key secret
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { GongClient } from "./gong-client.js";

// Initialize client from environment
const accessKey = process.env.GONG_ACCESS_KEY;
const accessKeySecret = process.env.GONG_ACCESS_KEY_SECRET;

if (!accessKey || !accessKeySecret) {
  console.error("ERROR: GONG_ACCESS_KEY and GONG_ACCESS_KEY_SECRET environment variables are required");
  process.exit(1);
}

const gong = new GongClient({ accessKey, accessKeySecret });

// Create MCP server
const server = new McpServer({
  name: "gong",
  version: "1.0.0",
});

// ============ CALL TOOLS ============

server.tool(
  "gong_list_calls",
  "List recent calls from Gong with optional date filters. Returns call metadata including title, duration, participants, and CRM context.",
  {
    from_date: z.string().optional().describe("Start date in ISO format (e.g., 2024-01-01T00:00:00Z)"),
    to_date: z.string().optional().describe("End date in ISO format"),
    cursor: z.string().optional().describe("Pagination cursor from previous response"),
  },
  async ({ from_date, to_date, cursor }) => {
    try {
      const result = await gong.listCalls({
        fromDateTime: from_date,
        toDateTime: to_date,
        cursor,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                calls: result.records.map((call) => ({
                  id: call.id,
                  title: call.title,
                  date: call.started,
                  duration_seconds: call.duration,
                  direction: call.direction,
                  url: call.url,
                  participants: call.parties?.map((p) => ({
                    name: p.name,
                    email: p.emailAddress,
                    affiliation: p.affiliation,
                    title: p.title,
                  })),
                })),
                next_cursor: result.cursor,
                total_records: result.totalRecords,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error listing calls: ${error}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "gong_get_call_details",
  "Get detailed information about specific calls including CRM context, topics discussed, and trackers detected.",
  {
    call_ids: z.array(z.string()).describe("Array of Gong call IDs to retrieve"),
  },
  async ({ call_ids }) => {
    try {
      const calls = await gong.getCallsExtensive(call_ids);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              calls.map((call) => ({
                id: call.id,
                title: call.title,
                date: call.started,
                duration_seconds: call.duration,
                url: call.url,
                participants: call.parties?.map((p) => ({
                  name: p.name,
                  email: p.emailAddress,
                  affiliation: p.affiliation,
                  title: p.title,
                })),
                topics: call.content?.topics,
                trackers: call.content?.trackers,
                crm_context: call.context,
              })),
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error getting call details: ${error}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "gong_get_transcript",
  "Get the full transcript of a specific call, including speaker identification and timestamps.",
  {
    call_id: z.string().describe("The Gong call ID"),
  },
  async ({ call_id }) => {
    try {
      const transcript = await gong.getTranscript(call_id);

      // Format transcript for readability
      const formattedTranscript = transcript.transcript
        .map((entry) => {
          const sentences = entry.sentences.map((s) => s.text).join(" ");
          return `[Speaker ${entry.speakerId}${entry.topic ? ` - ${entry.topic}` : ""}]: ${sentences}`;
        })
        .join("\n\n");

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                call_id: transcript.callId,
                transcript_raw: transcript.transcript,
                transcript_formatted: formattedTranscript,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error getting transcript: ${error}` }],
        isError: true,
      };
    }
  }
);

// ============ USER TOOLS ============

server.tool(
  "gong_list_users",
  "List all users in the Gong workspace. Useful for finding user IDs to filter calls by rep.",
  {
    cursor: z.string().optional().describe("Pagination cursor from previous response"),
  },
  async ({ cursor }) => {
    try {
      const result = await gong.listUsers(cursor);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                users: result.records.map((user) => ({
                  id: user.id,
                  email: user.emailAddress,
                  name: `${user.firstName} ${user.lastName}`,
                  title: user.title,
                  active: user.active,
                  manager_id: user.managerId,
                })),
                next_cursor: result.cursor,
                total_records: result.totalRecords,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error listing users: ${error}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "gong_get_user_stats",
  "Get aggregated activity statistics for users over a date range. Includes call counts, talk time, etc.",
  {
    from_date: z.string().describe("Start date in YYYY-MM-DD format"),
    to_date: z.string().describe("End date in YYYY-MM-DD format"),
    user_ids: z.array(z.string()).optional().describe("Optional list of user IDs to filter by"),
  },
  async ({ from_date, to_date, user_ids }) => {
    try {
      const stats = await gong.getUserStats({
        fromDate: from_date,
        toDate: to_date,
        userIds: user_ids,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ user_stats: stats }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error getting user stats: ${error}` }],
        isError: true,
      };
    }
  }
);

// ============ CRM / DEAL TOOLS ============

server.tool(
  "gong_get_calls_for_account",
  "Get all calls associated with a specific CRM account or deal. Useful for account research.",
  {
    object_type: z.enum(["Account", "Deal", "Lead", "Contact"]).describe("Type of CRM object"),
    object_ids: z.array(z.string()).describe("CRM object IDs (e.g., Salesforce Account IDs)"),
    from_date: z.string().optional().describe("Start date in ISO format"),
    to_date: z.string().optional().describe("End date in ISO format"),
  },
  async ({ object_type, object_ids, from_date, to_date }) => {
    try {
      const links = await gong.getCallsByCrmObject({
        objectType: object_type,
        objectIds: object_ids,
        fromDateTime: from_date,
        toDateTime: to_date,
      });

      // Get detailed call info for all linked calls
      const allCallIds = links.flatMap((l) => l.calls.map((c) => c.callId));

      let callDetails: Awaited<ReturnType<typeof gong.getCallsExtensive>> = [];
      if (allCallIds.length > 0) {
        callDetails = await gong.getCallsExtensive(allCallIds);
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                crm_objects: links.map((link) => ({
                  object_id: link.objectId,
                  call_count: link.calls.length,
                  calls: link.calls.map((c) => {
                    const detail = callDetails.find((d) => d.id === c.callId);
                    return {
                      call_id: c.callId,
                      title: detail?.title,
                      date: detail?.started,
                      duration_seconds: detail?.duration,
                      participants: detail?.parties?.map((p) => ({
                        name: p.name,
                        affiliation: p.affiliation,
                      })),
                    };
                  }),
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error getting calls for CRM object: ${error}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "gong_list_deals",
  "List deals/opportunities synced from CRM. Shows deal stage, amount, close date.",
  {
    from_date: z.string().optional().describe("Start date in ISO format"),
    to_date: z.string().optional().describe("End date in ISO format"),
    cursor: z.string().optional().describe("Pagination cursor from previous response"),
  },
  async ({ from_date, to_date, cursor }) => {
    try {
      const result = await gong.listDeals({
        fromDateTime: from_date,
        toDateTime: to_date,
        cursor,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                deals: result.records.map((deal) => ({
                  id: deal.id,
                  title: deal.title,
                  account: deal.account,
                  stage: deal.stage,
                  status: deal.status,
                  amount: deal.amount,
                  close_date: deal.closeDate,
                  url: deal.url,
                })),
                next_cursor: result.cursor,
                total_records: result.totalRecords,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error listing deals: ${error}` }],
        isError: true,
      };
    }
  }
);

// ============ EMAIL TOOLS ============

server.tool(
  "gong_list_emails",
  "List emails captured by Gong's email integration. Shows subject, participants, direction.",
  {
    from_date: z.string().optional().describe("Start date in ISO format"),
    to_date: z.string().optional().describe("End date in ISO format"),
    cursor: z.string().optional().describe("Pagination cursor from previous response"),
  },
  async ({ from_date, to_date, cursor }) => {
    try {
      const result = await gong.listEmails({
        fromDateTime: from_date,
        toDateTime: to_date,
        cursor,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                emails: result.records.map((email) => ({
                  id: email.id,
                  subject: email.subject,
                  from: email.fromEmailAddress,
                  to: email.toEmailAddresses,
                  cc: email.ccEmailAddresses,
                  sent_time: email.sentTime,
                  direction: email.direction,
                })),
                next_cursor: result.cursor,
                total_records: result.totalRecords,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error listing emails: ${error}` }],
        isError: true,
      };
    }
  }
);

// ============ LIBRARY TOOLS ============

server.tool(
  "gong_list_library_folders",
  "List saved call folders in the Gong library. Useful for finding curated collections of calls.",
  {},
  async () => {
    try {
      const folders = await gong.listLibraryFolders();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ folders }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error listing library folders: ${error}` }],
        isError: true,
      };
    }
  }
);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Gong MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
