import "dotenv/config";
import Bolt from "@slack/bolt";
import { isTriggeredIncident, parsePagerDutyMessage } from "./slack/pagerdutyMessage.js";
import { resolveChannelId } from "./slack/resolveChannel.js";
import { findErrorClusters } from "./datadog/traces.js";
import { lookupDebugId } from "./cal/client.js";
import { generateRca } from "./agent/rca.js";

const { App } = Bolt;

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

const alertsChannelId = await resolveChannelId(
  app.client,
  process.env.SLACK_ALERTS_CHANNEL_NAME ?? "elg-pagerduty-alerts"
);

app.message(async ({ message, say }) => {
  const msg = message as any;

  if (msg.channel !== alertsChannelId) return;

  // Only react to the PagerDuty bot's own alert messages, not our replies or human chatter.
  if (msg.username !== process.env.PAGERDUTY_BOT_NAME && msg.bot_profile?.name !== process.env.PAGERDUTY_BOT_NAME) {
    return;
  }

  // Resolved incidents post to the same channel — skip anything that isn't a fresh trigger.
  if (!isTriggeredIncident(msg)) return;

  const alert = parsePagerDutyMessage(msg);
  if (!alert) {
    console.warn("Could not parse PagerDuty message, skipping:", msg.text);
    return;
  }

  console.log(`Alert for ${alert.serviceName} at ${alert.triggeredAt.toISOString()}`);

  const clusters = await findErrorClusters(alert.serviceName, alert.triggeredAt);

  for (const cluster of clusters) {
    if (!cluster.errorMessage && cluster.sampleTraceId) {
      cluster.debugId = (await lookupDebugId(cluster.sampleTraceId)) ?? undefined;
    }
  }

  const rca = await generateRca(alert.serviceName, clusters);

  await say({
    text: rca,
    thread_ts: msg.ts,
  });
});

await app.start();
console.log("pd-rca-agent is running");
