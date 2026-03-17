import * as api from "./base";

export interface LogResponse {
	lines: string[];
	totalSize: number;
	fileName: string;
	lineCount: number;
}

export async function getProxyHostAccessLog(hostId: number, lines?: number, search?: string): Promise<LogResponse> {
	return await api.get({
		url: `/nginx/proxy-hosts/${hostId}/logs`,
		params: {
			lines: lines ?? undefined,
			search: search || undefined,
		},
	});
}

export async function getProxyHostErrorLog(hostId: number, lines?: number, search?: string): Promise<LogResponse> {
	return await api.get({
		url: `/nginx/proxy-hosts/${hostId}/error-log`,
		params: {
			lines: lines ?? undefined,
			search: search || undefined,
		},
	});
}
