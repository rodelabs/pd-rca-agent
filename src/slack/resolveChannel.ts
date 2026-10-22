import type { WebClient } from "@slack/web-api";

/**
 * The bot token gives us access by channel ID, not name, so we resolve the
 * configured channel name once at startup and filter incoming events by ID.
 * Needs the `channels:read` scope (add `groups:read` too if the channel is private).
 */
export async function resolveChannelId(client: WebClient, channelName: string): Promise<string> {
  const target = channelName.replace(/^#/, "");
  let cursor: string | undefined;

  do {
    const result = await client.conversations.list({
      types: "public_channel,private_channel",
      limit: 200,
      cursor,
    });

    const match = result.channels?.find((c) => c.name === target);
    if (match?.id) return match.id;

    cursor = result.response_metadata?.next_cursor || undefined;
  } while (cursor);

  throw new Error(`Could not find Slack channel "#${target}" — is the bot invited to it?`);
}
