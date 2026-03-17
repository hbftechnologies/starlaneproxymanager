import { useQuery } from "@tanstack/react-query";
import { type LogResponse, getProxyHostAccessLog, getProxyHostErrorLog } from "src/api/backend";

const useProxyHostAccessLog = (
	hostId: number,
	lines?: number,
	search?: string,
	options: { enabled?: boolean; refetchInterval?: number | false } = {},
) => {
	return useQuery<LogResponse, Error>({
		queryKey: ["proxy-host-access-log", hostId, { lines, search }],
		queryFn: () => getProxyHostAccessLog(hostId, lines, search),
		staleTime: 5 * 1000,
		enabled: options.enabled !== false,
		refetchInterval: options.refetchInterval || false,
		...options,
	});
};

const useProxyHostErrorLog = (
	hostId: number,
	lines?: number,
	search?: string,
	options: { enabled?: boolean; refetchInterval?: number | false } = {},
) => {
	return useQuery<LogResponse, Error>({
		queryKey: ["proxy-host-error-log", hostId, { lines, search }],
		queryFn: () => getProxyHostErrorLog(hostId, lines, search),
		staleTime: 5 * 1000,
		enabled: options.enabled !== false,
		refetchInterval: options.refetchInterval || false,
		...options,
	});
};

export { useProxyHostAccessLog, useProxyHostErrorLog };
