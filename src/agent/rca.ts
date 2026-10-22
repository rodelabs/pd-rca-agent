import Anthropic from "@anthropic-ai/sdk";
import type { ErrorCluster } from "../datadog/traces.js";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: 3,
  timeout: 60_000,
});

export function summarizeClusters(clusters: ErrorCluster[]): string {
  return clusters
    .map(
      (c, i) =>
        `${i + 1}. [${c.count}x] ${c.errorType}: ${c.errorMessage || "(no message — see debug detail)"}` +
        (c.debugId ? `\n   Debug detail: ${c.debugId}` : "")
    )
    .join("\n");
}

export async function generateRca(serviceName: string, clusters: ErrorCluster[]): Promise<string> {
  const clusterSummary = summarizeClusters(clusters);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content:
          `A PagerDuty alert fired for the "${serviceName}" service. Below are the distinct error ` +
          `fingerprints pulled from Datadog APM traces during the incident window, most frequent first.\n\n${clusterSummary}\n\n` +
          `Write a concise root-cause analysis for posting in Slack: what's failing, the likely cause, ` +
          `and one suggested next step. Use Slack mrkdwn (e.g. *bold*), keep it under 150 words, no headers.`,
      },
    ],
  });

  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

// if error is found here, return from here itself without involking cal
// while returning response, we need to format it propely,
// so that slack msg would be displayed in readable format