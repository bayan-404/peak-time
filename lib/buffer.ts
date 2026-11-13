// Server-only Buffer GraphQL client.
// Never import this from a client component: it handles the user's access token.
import "server-only";
import type { Channel } from "./types";

const BUFFER_API_URL = "https://api.buffer.com";
const PAGE_SIZE = 100;
const MAX_PAGES = 10; // up to 1,000 posts; protects the shared rate limit

// Stop writing when a window has this few requests left, so page loads
// (channels, sign-in checks) still work while we wait for the reset.
const QUOTA_RESERVE = 5;

type GraphQLResponse<T> = {
  data?: T;
  errors?: { message: string; extensions?: { code?: string } }[];
};

export class BufferApiError extends Error {
  constructor(
    message: string,
    public code?: string,
    // status: HTTP status of a failed call. retryAfter: seconds to wait after a 429.
    public info: { status?: number; retryAfter?: number } = {},
  ) {
    super(message);
  }
}

/**
 * Reads Buffer's `RateLimit` header (one policy per window, e.g.
 * `"100-in-15min"; r=3; t=412`). Returns the seconds until the reset of a
 * window that is nearly used up, or null while there is room in all of them.
 */
function lowQuotaSeconds(header: string | null): number | null {
  let wait: number | null = null;
  // fetch joins the repeated headers into one comma-separated string.
  for (const policy of header?.split(/,\s*(?=")/) ?? []) {
    const r = policy.match(/r=(\d+)/);
    const t = policy.match(/t=(\d+)/);
    if (!r || !t || Number(r[1]) > QUOTA_RESERVE) continue;
    wait = Math.max(wait ?? 0, Number(t[1]));
  }
  return wait;
}

/** Sends one GraphQL query to Buffer and returns only the data. */
async function bufferQuery<T>(query: string, variables: Record<string, unknown> | undefined, token: string): Promise<T> {
  return (await bufferRequest<T>(query, variables, token)).data;
}

/**
 * Sends one GraphQL query to Buffer.
 * GraphQL returns HTTP 200 even on failure, so we must check `errors`.
 * `lowQuota` is the wait in seconds when a rate-limit window is nearly empty.
 */
async function bufferRequest<T>(
  query: string,
  variables: Record<string, unknown> | undefined,
  token: string,
): Promise<{ data: T; lowQuota: number | null }> {
  const res = await fetch(BUFFER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  // A 429 costs no quota and Retry-After says exactly how long to wait.
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("retry-after")) || 0;
    throw new BufferApiError("Buffer rate limit reached", "RATE_LIMITED", { status: 429, retryAfter });
  }
  if (!res.ok) throw new BufferApiError(`Buffer HTTP ${res.status}`, "HTTP", { status: res.status });

  const json = (await res.json()) as GraphQLResponse<T>;
  if (json.errors?.length) {
    const e = json.errors[0];
    throw new BufferApiError(e.message, e.extensions?.code);
  }
  return { data: json.data as T, lowQuota: lowQuotaSeconds(res.headers.get("ratelimit")) };
}

/** First organization on the account. Most creators have exactly one. */
export async function getOrganizationId(token: string): Promise<string> {
  const data = await bufferQuery<{
    account: { organizations: { id: string }[] };
  }>(`query { account { organizations { id } } }`, undefined, token);
  const org = data.account.organizations[0];
  if (!org) throw new BufferApiError("No Buffer organization found", "NO_ORG");
  return org.id;
}

export async function getChannels(organizationId: string, token: string): Promise<Channel[]> {
  const data = await bufferQuery<{
    channels: {
      id: string;
      name: string;
      displayName: string | null;
      service: string;
      avatar: string;
      isDisconnected: boolean;
    }[];
  }>(
    `query Channels($organizationId: OrganizationId!) {
      channels(input: { organizationId: $organizationId }) {
        id name displayName service avatar isDisconnected
      }
    }`,
    { organizationId },
    token,
  );
  return data.channels
    .filter((c) => !c.isDisconnected)
    .map((c) => ({
      id: c.id,
      name: c.displayName || c.name,
      service: c.service,
      avatar: c.avatar,
    }));
}

export type ScheduledPost = { id: string; status: string; dueAt: string | null; text: string; channelId: string };

/**
 * Schedules one post at an exact time (mode: customScheduled + dueAt).
 * Also returns `lowQuota` so the caller can stop before hitting a 429.
 */
export async function createScheduledPost(
  token: string,
  input: { channelId: string; text: string; dueAt: string },
): Promise<{ post: ScheduledPost; lowQuota: number | null }> {
  const { data, lowQuota } = await bufferRequest<{
    createPost: { __typename: string; post?: ScheduledPost; message?: string };
  }>(
    `mutation CreatePost($input: CreatePostInput!) {
      createPost(input: $input) {
        __typename
        ... on PostActionSuccess { post { id status dueAt text channelId } }
        ... on MutationError { message }
      }
    }`,
    { input: { ...input, schedulingType: "automatic", mode: "customScheduled" } },
    token,
  );
  // Mutation failures come back as a union member, not in `errors`.
  if (!data.createPost.post) {
    const message = data.createPost.message ?? "createPost failed";
    // A plan limit (e.g. 10 scheduled posts per channel on the free plan) is
    // not a broken post: every later post would fail the same way.
    const limit = data.createPost.__typename === "LimitReachedError" || /limit reached/i.test(message);
    throw new BufferApiError(message, limit ? "LIMIT_REACHED" : "MUTATION");
  }
  return { post: data.createPost.post, lowQuota };
}

/**
 * Moves a scheduled post to a new time. Safe to repeat: sending the same
 * time twice changes nothing. The text must be sent along: Buffer answers
 * "Post must have either text or media" to an edit that leaves it out.
 */
export async function moveScheduledPost(
  token: string,
  input: { id: string; text: string; dueAt: string },
): Promise<{ dueAt: string; lowQuota: number | null }> {
  const { data, lowQuota } = await bufferRequest<{
    editPost: { __typename: string; post?: { id: string; dueAt: string | null }; message?: string };
  }>(
    `mutation MovePost($input: EditPostInput!) {
      editPost(input: $input) {
        __typename
        ... on PostActionSuccess { post { id dueAt } }
        ... on MutationError { message }
      }
    }`,
    { input: { ...input, mode: "customScheduled" } },
    token,
  );
  if (!data.editPost.post) {
    throw new BufferApiError(data.editPost.message ?? "editPost failed", "MUTATION");
  }
  return { dueAt: data.editPost.post.dueAt ?? input.dueAt, lowQuota };
}

/**
 * Scheduled posts on these channels due between `start` and `end` (ISO).
 * createPost has no idempotency key, so this is how we find out whether a
 * write with an unknown outcome reached Buffer before creating it again.
 */
export async function getScheduledPosts(
  token: string,
  organizationId: string,
  channelIds: string[],
  start: string,
  end: string,
): Promise<{ id: string; dueAt: string; channelId: string }[]> {
  const found: { id: string; dueAt: string; channelId: string }[] = [];
  let after: string | null = null;
  // Re-serialized so only a real ISO date can be placed in the query text.
  const startIso = new Date(start).toISOString();
  const endMs = Date.parse(end);

  for (let page = 0; page < MAX_PAGES; page++) {
    const data: {
      posts: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        edges: { node: { id: string; dueAt: string | null; channelId: string } }[] | null;
      };
    } = await bufferQuery(
      `query ScheduledPosts($organizationId: OrganizationId!, $channelIds: [ChannelId!], $first: Int, $after: String) {
        posts(first: $first, after: $after, input: {
          organizationId: $organizationId,
          filter: { status: [scheduled], channelIds: $channelIds, dueAt: { start: ${JSON.stringify(startIso)} } },
          sort: { field: dueAt, direction: asc }
        }) {
          pageInfo { hasNextPage endCursor }
          edges { node { id dueAt channelId } }
        }
      }`,
      { organizationId, channelIds, first: PAGE_SIZE, after },
      token,
    );

    // Sorted oldest first, so we can stop at the first post past `end`.
    for (const { node } of data.posts.edges ?? []) {
      if (!node.dueAt) continue;
      if (Date.parse(node.dueAt) > endMs) return found;
      found.push({ id: node.id, dueAt: node.dueAt, channelId: node.channelId });
    }

    if (!data.posts.pageInfo.hasNextPage) break;
    after = data.posts.pageInfo.endCursor;
  }
  return found;
}
