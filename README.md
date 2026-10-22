# pd-rca-agent

Listens for PagerDuty alerts posted in Slack, pulls the matching error traces
from Datadog APM, and posts a root-cause analysis back in the same thread.

## Flow

1. PagerDuty's Slack integration posts triggered and resolved incidents into
   `#elg-pagerduty-alerts` (configurable via `SLACK_ALERTS_CHANNEL_NAME`).
2. This app (Slack Bolt, Socket Mode) hears every message in that channel,
   filters to that channel ID (resolved by name at startup — see
   [src/slack/resolveChannel.ts](src/slack/resolveChannel.ts)), skips anything
   that isn't a *triggered* incident (resolved messages land in the same
   channel — see `isTriggeredIncident` in
   [src/slack/pagerdutyMessage.ts](src/slack/pagerdutyMessage.ts)), then parses
   out the service name + trigger time from what's left.
3. It queries Datadog's Trace Search API for error spans on that service in a
   window around the alert, then collapses them into distinct error
   fingerprints (type + message) so duplicates don't flood the analysis —
   see [src/datadog/traces.ts](src/datadog/traces.ts).
4. For any fingerprint missing a usable error message, it looks up the trace's
   debug id in the internal Cal system — see [src/cal/client.ts](src/cal/client.ts)
   (currently a stub; fill in Cal's real endpoint).
5. Claude turns the clustered error data into a short RCA — see
   [src/agent/rca.ts](src/agent/rca.ts).
6. The RCA is posted as a threaded reply on the original alert message.

## Setup

```bash
npm install
cp .env.example .env   # fill in Slack/Datadog/Anthropic/Cal credentials
npm run dev
```

Slack app needs Socket Mode enabled, an app-level token (`connections:write`),
a bot token with `chat:write` + `channels:history` + `channels:read` (or the
`groups:*` equivalents if `#elg-pagerduty-alerts` is private), and must be
invited to that channel.

## Known gaps to fill in before this is production-ready

- `parsePagerDutyMessage` and `isTriggeredIncident` guess at PagerDuty's Slack
  message shape — log a real triggered alert and a real resolved one, then
  adjust the field/text lookups to match your PD-Slack app config.
- `lookupDebugId` is a stub pointing at a placeholder Cal endpoint.
- Failures are retried (3 attempts, exponential backoff) and then degrade to a
  partial reply in the thread, but there's no persistent retry queue — a long
  Datadog outage means that alert only gets the "check manually" message.
