import * as api from "./base";
import type { AuditLogExpansion } from "./expansions";
import type { AuditLog } from "./models";

export interface AuditLogParams {
	page?: number;
	limit?: number;
	dateFrom?: string;
	dateTo?: string;
	userId?: number;
	action?: string;
	objectType?: string;
	query?: string;
}

export interface AuditLogPagination {
	total: number;
	page: number;
	limit: number;
	totalPages: number;
}

export interface PaginatedAuditLogs {
	data: AuditLog[];
	pagination: AuditLogPagination;
}

export async function getAuditLogs(expand?: AuditLogExpansion[], params: AuditLogParams = {}): Promise<PaginatedAuditLogs> {
	return await api.get({
		url: "/audit-log",
		params: {
			expand: expand?.join(","),
			...params,
		},
	});
}
