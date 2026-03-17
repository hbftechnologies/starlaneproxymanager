import * as api from "./base";
import type { AuditLogParams } from "./getAuditLogs";

export async function exportAuditLogs(format: "csv" | "json", params: AuditLogParams = {}): Promise<void> {
	const filename = `audit-log-export.${format}`;
	await api.download(
		{
			url: "/audit-log/export",
			params: {
				format,
				...params,
			},
		},
		filename,
	);
}
