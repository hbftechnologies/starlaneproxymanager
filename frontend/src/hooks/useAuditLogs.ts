import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type AuditLogExpansion, type AuditLogParams, type PaginatedAuditLogs, getAuditLogs } from "src/api/backend";

const fetchAuditLogs = (expand?: AuditLogExpansion[], params?: AuditLogParams) => {
	return getAuditLogs(expand, params);
};

const useAuditLogs = (expand?: AuditLogExpansion[], params?: AuditLogParams, options = {}) => {
	return useQuery<PaginatedAuditLogs, Error>({
		queryKey: ["audit-logs", { expand, params }],
		queryFn: () => fetchAuditLogs(expand, params),
		staleTime: 10 * 1000,
		placeholderData: keepPreviousData,
		...options,
	});
};

export { fetchAuditLogs, useAuditLogs };
