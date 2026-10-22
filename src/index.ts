import "dotenv/config";
import Bolt from "@slack/bolt";
import { isTriggeredIncident, parsePagerDutyMessage } from "./slack/pagerdutyMessage.js";
import { resolveChannelId } from "./slack/resolveChannel.js";
import { buildRcaMessage } from "./pipeline.js";

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

  let text: string;
  try {
    text = await buildRcaMessage(alert);
  } catch (err) {
    console.error("Unexpected failure building RCA:", err);
    text = `:warning: Something went wrong while analyzing *${alert.serviceName}*. Please investigate manually.`;
  }

  try {
    await say({ text, thread_ts: msg.ts });
  } catch (err) {
    console.error("Failed to post reply to Slack:", err);
  }
});

await app.start();
console.log("pd-rca-agent is running");
