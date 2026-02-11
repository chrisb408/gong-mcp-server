/**
 * Gong API Client
 * Handles authentication and API requests to Gong's REST API
 *
 * API Docs: https://help.gong.io/docs/what-the-gong-api-provides
 * Rate Limits: ~1000 requests/hour per API key
 */

const GONG_API_BASE = "https://api.gong.io/v2";

export interface GongConfig {
  accessKey: string;
  accessKeySecret: string;
}

export interface GongCall {
  id: string;
  title: string;
  scheduled: string;
  started: string;
  duration: number;
  primaryUserId: string;
  direction: string;
  scope: string;
  media: string;
  language: string;
  url: string;
  parties: GongParty[];
  content?: GongCallContent;
  context?: GongCallContext[];
}

export interface GongParty {
  id: string;
  emailAddress: string;
  name: string;
  title?: string;
  userId?: string;
  speakerId?: string;
  context?: GongPartyContext[];
  affiliation: "Internal" | "External" | "Unknown";
}

export interface GongPartyContext {
  system: string;
  objects: { objectType: string; objectId: string; fields: { name: string; value: string }[] }[];
}

export interface GongCallContent {
  trackers?: { id: string; name: string; count: number; occurrences: { startTime: number }[] }[];
  topics?: { name: string; duration: number }[];
  pointsOfInterest?: { type: string; startTime: number }[];
}

export interface GongCallContext {
  system: string;
  objects: { objectType: string; objectId: string; fields: { name: string; value: string }[] }[];
}

export interface GongTranscript {
  callId: string;
  transcript: GongTranscriptEntry[];
}

export interface GongTranscriptEntry {
  speakerId: string;
  topic?: string;
  sentences: { start: number; end: number; text: string }[];
}

export interface GongUser {
  id: string;
  emailAddress: string;
  firstName: string;
  lastName: string;
  title?: string;
  phoneNumber?: string;
  extension?: string;
  personalMeetingUrls?: string[];
  settings: { webConferencesRecorded: boolean; preventWebConferenceRecording: boolean };
  managerId?: string;
  meetingConsentPageUrl?: string;
  active: boolean;
  created: string;
}

export interface GongDeal {
  id: string;
  url?: string;
  title?: string;
  account?: { id: string; name: string };
  closeDate?: string;
  amount?: number;
  stage?: string;
  status?: string;
}

export interface GongEmail {
  id: string;
  subject?: string;
  fromEmailAddress: string;
  toEmailAddresses: string[];
  ccEmailAddresses?: string[];
  sentTime: string;
  direction: "Inbound" | "Outbound";
  body?: string;
}

export interface PaginatedResponse<T> {
  records: T[];
  cursor?: string;
  totalRecords?: number;
}

export class GongClient {
  private authHeader: string;

  constructor(config: GongConfig) {
    // Gong uses HTTP Basic Auth with accessKey:accessKeySecret
    const credentials = Buffer.from(`${config.accessKey}:${config.accessKeySecret}`).toString("base64");
    this.authHeader = `Basic ${credentials}`;
  }

  private async request<T>(
    endpoint: string,
    method: "GET" | "POST" = "GET",
    body?: Record<string, unknown>
  ): Promise<T> {
    const url = `${GONG_API_BASE}${endpoint}`;

    const response = await fetch(url, {
      method,
      headers: {
        "Authorization": this.authHeader,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gong API error (${response.status}): ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  // ============ CALLS ============

  /**
   * List calls with optional filters
   */
  async listCalls(params: {
    fromDateTime?: string;
    toDateTime?: string;
    workspaceId?: string;
    cursor?: string;
  } = {}): Promise<PaginatedResponse<GongCall>> {
    // Build query parameters (Gong API uses snake_case)
    const queryParams = new URLSearchParams();
    if (params.fromDateTime) queryParams.append("fromDateTime", params.fromDateTime);
    if (params.toDateTime) queryParams.append("toDateTime", params.toDateTime);
    if (params.workspaceId) queryParams.append("workspaceId", params.workspaceId);
    if (params.cursor) queryParams.append("cursor", params.cursor);

    const endpoint = `/calls${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;

    const response = await this.request<{
      requestId: string;
      records: { currentPageSize: number; currentPageNumber: number; cursor?: string; totalRecords: number };
      calls: GongCall[];
    }>(endpoint, "GET");

    return {
      records: response.calls,
      cursor: response.records.cursor,
      totalRecords: response.records.totalRecords,
    };
  }

  /**
   * Get detailed call data including CRM context
   */
  async getCallsExtensive(callIds: string[]): Promise<GongCall[]> {
    const response = await this.request<{
      requestId: string;
      records: { currentPageSize: number };
      calls: GongCall[];
    }>("/calls/extensive", "POST", {
      filter: { callIds },
      contentSelector: {
        context: "Extended",
        exposedFields: {
          parties: true,
          content: { trackers: true, topics: true, pointsOfInterest: true },
          collaboration: { publicComments: true },
        },
      },
    });

    return response.calls;
  }

  /**
   * Get call transcript
   */
  async getTranscript(callId: string): Promise<GongTranscript> {
    const response = await this.request<{
      requestId: string;
      callTranscripts: GongTranscript[];
    }>("/calls/transcript", "POST", {
      filter: { callIds: [callId] },
    });

    return response.callTranscripts[0];
  }

  /**
   * Search calls by various criteria
   */
  async searchCalls(params: {
    searchTerm?: string;
    fromDateTime?: string;
    toDateTime?: string;
    primaryUserIds?: string[];
    cursor?: string;
  }): Promise<PaginatedResponse<GongCall>> {
    // Use list calls with filters - Gong doesn't have a dedicated search endpoint
    // but we can filter by users and dates
    return this.listCalls({
      fromDateTime: params.fromDateTime,
      toDateTime: params.toDateTime,
      cursor: params.cursor,
    });
  }

  // ============ USERS ============

  /**
   * List all users in the workspace
   */
  async listUsers(cursor?: string): Promise<PaginatedResponse<GongUser>> {
    // Build query parameters
    const queryParams = new URLSearchParams();
    if (cursor) queryParams.append("cursor", cursor);

    const endpoint = `/users${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;

    const response = await this.request<{
      requestId: string;
      records: { currentPageSize: number; currentPageNumber: number; cursor?: string; totalRecords: number };
      users: GongUser[];
    }>(endpoint, "GET");

    return {
      records: response.users,
      cursor: response.records.cursor,
      totalRecords: response.records.totalRecords,
    };
  }

  /**
   * Get specific users by ID
   */
  async getUsers(userIds: string[]): Promise<GongUser[]> {
    const response = await this.request<{
      requestId: string;
      users: GongUser[];
    }>("/users/extensive", "POST", {
      filter: { userIds },
    });

    return response.users;
  }

  // ============ CRM / DEALS ============

  /**
   * Get calls associated with CRM objects (accounts/deals)
   */
  async getCallsByCrmObject(params: {
    objectType: "Account" | "Deal" | "Lead" | "Contact";
    objectIds: string[];
    fromDateTime?: string;
    toDateTime?: string;
  }): Promise<{ objectId: string; calls: { callId: string }[] }[]> {
    const response = await this.request<{
      requestId: string;
      crmCallsLinks: { objectId: string; calls: { callId: string }[] }[];
    }>("/crm/object/calls", "POST", {
      filter: {
        objectType: params.objectType,
        objectIds: params.objectIds,
        fromDateTime: params.fromDateTime,
        toDateTime: params.toDateTime,
      },
    });

    return response.crmCallsLinks;
  }

  /**
   * List deals/opportunities
   */
  async listDeals(params: {
    fromDateTime?: string;
    toDateTime?: string;
    cursor?: string;
  } = {}): Promise<PaginatedResponse<GongDeal>> {
    // Note: This requires CRM integration to be set up
    const response = await this.request<{
      requestId: string;
      records: { currentPageSize: number; cursor?: string; totalRecords: number };
      deals: GongDeal[];
    }>("/crm/deals", "POST", {
      filter: {
        fromDateTime: params.fromDateTime,
        toDateTime: params.toDateTime,
      },
      cursor: params.cursor,
    });

    return {
      records: response.deals || [],
      cursor: response.records?.cursor,
      totalRecords: response.records?.totalRecords,
    };
  }

  // ============ EMAILS ============

  /**
   * List emails (requires email integration)
   */
  async listEmails(params: {
    fromDateTime?: string;
    toDateTime?: string;
    cursor?: string;
  } = {}): Promise<PaginatedResponse<GongEmail>> {
    const response = await this.request<{
      requestId: string;
      records: { currentPageSize: number; cursor?: string; totalRecords: number };
      emailActivities: GongEmail[];
    }>("/emails", "POST", {
      filter: {
        fromDateTime: params.fromDateTime,
        toDateTime: params.toDateTime,
      },
      cursor: params.cursor,
    });

    return {
      records: response.emailActivities || [],
      cursor: response.records?.cursor,
      totalRecords: response.records?.totalRecords,
    };
  }

  // ============ STATS ============

  /**
   * Get aggregated stats for users
   */
  async getUserStats(params: {
    fromDate: string;
    toDate: string;
    userIds?: string[];
  }): Promise<Record<string, unknown>[]> {
    const response = await this.request<{
      requestId: string;
      usersStats: Record<string, unknown>[];
    }>("/stats/activity/aggregate", "POST", {
      filter: {
        fromDate: params.fromDate,
        toDate: params.toDate,
        userIds: params.userIds,
      },
    });

    return response.usersStats;
  }

  // ============ LIBRARY (Saved Calls) ============

  /**
   * List library folders and saved calls
   */
  async listLibraryFolders(): Promise<{ id: string; name: string }[]> {
    const response = await this.request<{
      requestId: string;
      libraryFolders: { id: string; name: string }[];
    }>("/library/folders", "GET");

    return response.libraryFolders;
  }
}
