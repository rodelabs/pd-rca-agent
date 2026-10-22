import { v2, client } from "@datadog/datadog-api-client";
import { withRetry } from "../lib/retry.js";

const MAX_TRACES = 100;
const MAX_CLUSTERS = 5;

export interface ErrorCluster {
  errorType: string;
  errorMessage: string;
  count: number;
  sampleTraceId: string;
  debugId?: string;
}

function getSpansApi() {
  const configuration = client.createConfiguration({
    authMethods: {
      apiKeyAuth: process.env.DATADOG_API_KEY!,
      appKeyAuth: process.env.DATADOG_APP_KEY!,
    },
  });
  configuration.setServerVariables({ site: process.env.DATADOG_SITE ?? "datadoghq.com" });
  return new v2.SpansApi(configuration);
}

/**
 * Pulls error spans for a service in a window around the alert, then collapses
 * them into distinct error fingerprints (type + message) so we don't hand the
 * LLM hundreds of near-duplicate traces from the same underlying failure.
 */
export async function findErrorClusters(
  serviceName: string,
  around: Date
): Promise<ErrorCluster[]> {
  const from = new Date(around.getTime() - 10 * 60 * 1000).toISOString();
  const to = new Date(around.getTime() + 2 * 60 * 1000).toISOString();

  const api = getSpansApi();
  const response = await withRetry(() =>
    api.listSpans({
      body: {
        data: {
          attributes: {
            filter: {
              query: `service:${serviceName} status:error`,
              from,
              to,
            },
            sort: "-timestamp",
            page: { limit: MAX_TRACES },
          },
          type: "search_request",
        },
      },
    })
  );

  const spans = response.data ?? [];
  const clusters = new Map<string, ErrorCluster>();

  for (const span of spans) {
    const attrs = (span.attributes as any)?.attributes ?? {};
    const errorType = attrs["error.type"] ?? "unknown";
    const errorMessage = attrs["error.message"] ?? "";
    const key = `${errorType}:${errorMessage}`;

    const existing = clusters.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      clusters.set(key, {
        errorType,
        errorMessage,
        count: 1,
        sampleTraceId: (span.attributes as any)?.traceId ?? "",
      });
    }
  }

  return [...clusters.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_CLUSTERS);
}
