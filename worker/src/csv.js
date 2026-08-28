export function neutralizeSpreadsheetFormula(value) {
  const string = value == null ? "" : String(value);
  return /^[=+\-@\t\r]/.test(string) ? `'${string}` : string;
}

export function csvCell(value) {
  const string = neutralizeSpreadsheetFormula(value).replace(/"/g, '""');
  return `"${string}"`;
}

export function buildRsvpCsv(records) {
  const headings = [
    "ID",
    "Event ID",
    "Name",
    "Status",
    "Created At",
    "SMS Opened At",
    "SMS Open Count",
    "Confirmed At",
    "Source",
    "Referrer",
    "UTM Source",
    "UTM Medium",
    "UTM Campaign",
    "UTM Term",
    "UTM Content"
  ];
  const rows = records.map(record => [
    record.id,
    record.event_id,
    record.name,
    record.status,
    record.created_at,
    record.sms_opened_at,
    record.sms_open_count,
    record.confirmed_at,
    record.source,
    record.referrer,
    record.utm_source,
    record.utm_medium,
    record.utm_campaign,
    record.utm_term,
    record.utm_content
  ]);
  return `\uFEFF${[headings, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
