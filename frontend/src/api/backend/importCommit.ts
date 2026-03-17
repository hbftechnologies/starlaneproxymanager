import * as api from "./base";

export interface ConflictResolution {
	type: string;
	importIndex: number;
	action: "skip" | "overwrite" | "use_existing" | "create_new";
}

export interface ImportCommitRequest {
	payload: any;
	resolutions?: {
		conflicts: ConflictResolution[];
	};
}

export interface ImportCommitResult {
	accessLists: { created: number; skipped: number; overwritten: number };
	certificates: { created: number; skipped: number; usedExisting: number };
	proxyHosts: { created: number; skipped: number; overwritten: number };
	redirectionHosts: { created: number; skipped: number; overwritten: number };
	deadHosts: { created: number; skipped: number; overwritten: number };
	streams: { created: number; skipped: number; overwritten: number };
	settings: { updated: number; skipped: number };
}

export async function importCommit(request: ImportCommitRequest): Promise<ImportCommitResult> {
	return await api.post({
		url: "/import-export/import/commit",
		data: request,
	});
}
