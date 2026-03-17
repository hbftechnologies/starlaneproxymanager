import AuthStore from "src/modules/AuthStore";

export interface ImportConflict {
	type: string;
	importIndex: number;
	name?: string;
	domainNames?: string[];
	conflictingDomains?: string[];
	incomingPort?: number;
	existingId?: number;
	provider?: string;
}

export interface ImportSummaryItem {
	total: number;
	new: number;
	conflict: number;
}

export interface ImportPreviewResult {
	valid: boolean;
	exportInfo: Record<string, any>;
	summary: Record<string, ImportSummaryItem>;
	conflicts: ImportConflict[];
	payload: any;
}

export async function importPreview(file: File): Promise<ImportPreviewResult> {
	const formData = new FormData();
	formData.append("file", file);

	const headers: Record<string, string> = {};
	if (AuthStore.token) {
		headers.Authorization = `Bearer ${AuthStore.token.token}`;
	}

	const response = await fetch("/api/import-export/import/preview", {
		method: "POST",
		headers,
		body: formData,
	});

	if (!response.ok) {
		const payload = await response.json();
		throw new Error(payload?.error?.message || "Preview failed");
	}

	return await response.json();
}
