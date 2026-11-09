// Server-only Buffer GraphQL client.
// Never import this from a client component: it reads the secret API key.
import "server-only";

const BUFFER_API_URL = "https://api.buffer.com";

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
): Promise<T> {
  const key = process.env.BUFFER_API_KEY;
  if (!key) throw new BufferApiError("BUFFER_API_KEY is not set", "NO_KEY");

  const res = await fetch(BUFFER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // TODO: confirm header format in the Quick Start docs.
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

// TODO (needs Post type fields from the API Reference):
// - getOrganizationId()
// - getChannels(organizationId) → Channel[]
// - getSentPostsWithMetrics(organizationId, channelId) → PostSample[]
