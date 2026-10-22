import type { ParsedAlert } from "./slack/pagerdutyMessage.js";
import { findErrorClusters, type ErrorCluster } from "./datadog/traces.js";
import { lookupDebugId } from "./cal/client.js";
import { generateRca, summarizeClusters } from "./agent/rca.js";

function datadogServiceUrl(serviceName: string): string {
  const site = process.env.DATADOG_SITE ?? "datadoghq.com";
  return `https://app.${site}/apm/services/${encodeURIComponent(serviceName)}`;
}

/**
 * Always resolves to a message worth posting. Each external dependency degrades
 * on its own so a failure in one never leaves the alert thread unanswered.
 */
export async function buildRcaMessage(alert: ParsedAlert): Promise<string> {
  const { serviceName } = alert;
  const ddLink = datadogServiceUrl(serviceName);

  let clusters: ErrorCluster[];
  try {
    clusters = await findErrorClusters(serviceName, alert.triggeredAt);
  } catch (err) {
    console.error(`Datadog query failed for ${serviceName}:`, err);
    return `:warning: I couldn't pull traces from Datadog for *${serviceName}*, so there's no automated RCA. Please check manually: <${ddLink}|Datadog APM>`;
  }

  if (clusters.length === 0) {
    return `:mag: No error traces found for *${serviceName}* around the alert time. It may have recovered already, or the errors aren't traced. <${ddLink}|Datadog APM>`;
  }

  // Cal is only needed for clusters whose trace carried no error message.
  const needsCal = clusters.filter((c) => !c.errorMessage && c.sampleTraceId);
  const lookups = await Promise.allSettled(needsCal.map((c) => lookupDebugId(c.sampleTraceId)));
  lookups.forEach((result, i) => {
    if (result.status === "fulfilled") {
      needsCal[i].debugId = result.value ?? undefined;
    } else {
      console.error(`Cal lookup failed for trace ${needsCal[i].sampleTraceId}:`, result.reason);
    }
  });

  try {
    return await generateRca(serviceName, clusters);
  } catch (err) {
    console.error(`RCA generation failed for ${serviceName}:`, err);
    return (
      `:warning: I found errors for *${serviceName}* but couldn't generate an analysis. Raw error clusters:\n` +
      "```\n" +
      summarizeClusters(clusters) +
      "\n```\n" +
      `<${ddLink}|Datadog APM>`
    );
  }
}
