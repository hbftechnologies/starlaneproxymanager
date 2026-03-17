import * as api from "./base";

export interface ExportOptions {
	type?: "full" | "selective";
	includeTypes?: string[];
	hostIds?: number[];
}

export async function exportConfig(options: ExportOptions = {}): Promise<any> {
	return await api.post({
		url: "/import-export/export",
		data: {
			type: options.type || "full",
			includeTypes: options.includeTypes,
			hostIds: options.hostIds,
		},
	});
}
