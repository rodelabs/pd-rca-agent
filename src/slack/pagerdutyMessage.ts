export interface ParsedAlert {
  serviceName: string;
  triggeredAt: Date;
  incidentUrl?: string;
}

/**
 * Triggered and resolved incidents post to the same Slack channel as the same
 * `message` event type — the only way to tell them apart is the text/attachment
 * content PagerDuty puts in the message. This is deliberately conservative:
 * only an explicit "triggered" match returns true, so anything ambiguous
 * (acknowledged, escalated, unrecognized format) is skipped rather than
 * risking an RCA run against a resolved incident.
 */
export function isTriggeredIncident(message: any): boolean {
  const text: string = message.text ?? "";
  const attachments: any[] = message.attachments ?? [];
  const haystack = [text, ...attachments.map((a) => a.fallback ?? a.pretext ?? a.title ?? "")]
    .join(" ")
    .toLowerCase();

  if (haystack.includes("resolved")) return false;
  return haystack.includes("triggered");
}

/**
 * PagerDuty's Slack app posts alerts as message attachments/blocks, not plain text.
 * The exact field names depend on how your PD-Slack integration is configured, so
 * this reads the raw Slack message event and pulls out what it can find. Log
 * `message` once against a real alert and adjust the field lookups below to match.
 */
export function parsePagerDutyMessage(message: any): ParsedAlert | null {
  const text: string = message.text ?? "";
  const attachments: any[] = message.attachments ?? [];

  const fields = attachments.flatMap((a) => a.fields ?? []);
  const findField = (label: string) =>
    fields.find((f) => f.title?.toLowerCase().includes(label))?.value;

  const serviceName = findField("service") ?? extractServiceFromText(text);
  if (!serviceName) return null;

  const incidentUrl =
    attachments.find((a) => a.title_link)?.title_link ??
    text.match(/https?:\/\/\S+/)?.[0];

  return {
    serviceName,
    triggeredAt: new Date(Number(message.ts) * 1000),
    incidentUrl,
  };
}

function extractServiceFromText(text: string): string | undefined {
  return text.match(/\[.*?\]\s*(.+?)\s*(is|triggered)/i)?.[1];
}
