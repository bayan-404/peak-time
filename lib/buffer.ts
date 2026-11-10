// Server-only Buffer GraphQL client.
// Never import this from a client component: it reads the secret API key.
import "server-only";
import type { Channel, PostSample } from "./types";

const BUFFER_API_URL = "https://api.buffer.com";
const PAGE_SIZE = 100;
const MAX_PAGES = 10; // up to 1,000 posts; protects the shared rate limit

type GraphQLResponse<T> = {
  data?: T;
  errors?: { message: string; extensions?: { code?: string } }[];
};

export class BufferApiError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
  }
}

/**
 * Sends one GraphQL query to Buffer.
 * GraphQL returns HTTP 200 even on failure, so we must check `errors`.
 */
export async function bufferQuery<T>(
  query: string,
  variables?: Record<string, unknown>,
  token?: string | null,
): Promise<T> {
  // OAuth user token when connected; personal key only as a dev fallback.
  const key = token ?? process.env.BUFFER_API_KEY;
  if (!key) throw new BufferApiError("Not connected to Buffer", "NO_KEY");

  const res = await fetch(BUFFER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  if (!res.ok) throw new BufferApiError(`Buffer HTTP ${res.status}`, "HTTP");

  const json = (await res.json()) as GraphQLResponse<T>;
  if (json.errors?.length) {
    const e = json.errors[0];
    throw new BufferApiError(e.message, e.extensions?.code);
  }
  return json.data as T;
}

/** First organization on the account. Most creators have exactly one. */
export async function getOrganizationId(token?: string | null): Promise<string> {
  const data = await bufferQuery<{
    account: { organizations: { id: string }[] };
  }>(`query { account { organizations { id } } }`, undefined, token);
  const org = data.account.organizations[0];
  if (!org) throw new BufferApiError("No Buffer organization found", "NO_ORG");
  return org.id;
}

export async function getChannels(organizationId: string, token?: string | null): Promise<Channel[]> {
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

type RawPost = {
  id: string;
  sentAt: string | null;
  metricsUpdatedAt: string | null;
  metrics: { type: string; value: number }[] | null;
};

/** All sent posts for one channel, mapped into our own PostSample shape. */
export async function getSentPosts(
  organizationId: string,
  channelId: string,
): Promise<{ posts: PostSample[]; metricsUpdatedAt: string | null }> {
  const posts: PostSample[] = [];
  let metricsUpdatedAt: string | null = null;
  let after: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const data: {
      posts: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        edges: { node: RawPost }[] | null;
      };
    } = await bufferQuery(
      `query SentPosts($organizationId: OrganizationId!, $channelIds: [ChannelId!], $first: Int, $after: String) {
        posts(first: $first, after: $after, input: {
          organizationId: $organizationId,
          filter: { status: [sent], channelIds: $channelIds },
          sort: [{ field: dueAt, direction: desc }]
        }) {
          pageInfo { hasNextPage endCursor }
          edges { node { id sentAt metricsUpdatedAt metrics { type value } } }
        }
      }`,
      { organizationId, channelIds: [channelId], first: PAGE_SIZE, after },
    );

    for (const { node } of data.posts.edges ?? []) {
      if (!node.sentAt) continue;
      posts.push(toSample(node));
      if (node.metricsUpdatedAt && (!metricsUpdatedAt || node.metricsUpdatedAt > metricsUpdatedAt)) {
        metricsUpdatedAt = node.metricsUpdatedAt;
      }
    }

    if (!data.posts.pageInfo.hasNextPage) break;
    after = data.posts.pageInfo.endCursor;
  }

  return { posts, metricsUpdatedAt };
}

/**
 * Buffer returns metrics as a list of { type, value }, and each network
 * names things differently (likes vs reactions, reposts vs shares,
 * views vs impressions). This normalizes them.
 */
function toSample(node: RawPost): PostSample {
  const m = new Map((node.metrics ?? []).map((x) => [x.type, x.value]));
  const first = (...types: string[]) => {
    for (const t of types) if (m.has(t)) return m.get(t)!;
    return undefined;
  };
  return {
    id: node.id,
    sentAt: node.sentAt!,
    reactions: first("reactions", "likes") ?? 0,
    comments: first("comments") ?? 0,
    shares: first("shares", "reposts"),
    impressions: first("impressions", "views", "reach"),
  };
}

export type ScheduledPost = { id: string; status: string; dueAt: string | null; text: string; channelId: string };

/** Schedules one post at an exact time (mode: customScheduled + dueAt). */
export async function createScheduledPost(
  token: string,
  input: { channelId: string; text: string; dueAt: string },
): Promise<ScheduledPost> {
  const data = await bufferQuery<{
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
    throw new BufferApiError(data.createPost.message ?? "createPost failed", "MUTATION");
  }
  return data.createPost.post;
}
