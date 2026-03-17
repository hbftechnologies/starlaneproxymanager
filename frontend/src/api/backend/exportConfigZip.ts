import AuthStore from "src/modules/AuthStore";

export interface ExportZipOptions {
	type?: "full" | "selective";
	includeTypes?: string[];
	hostIds?: number[];
}

export async function exportConfigZip(options: ExportZipOptions = {}): Promise<void> {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};

	if (AuthStore.token) {
		headers.Authorization = `Bearer ${AuthStore.token.token}`;
	}

	const response = await fetch("/api/import-export/export/download", {
		method: "POST",
		headers,
		body: JSON.stringify({
			type: options.type || "full",
			include_types: options.includeTypes,
			host_ids: options.hostIds,
		}),
	});

	if (!response.ok) {
		throw new Error("Export failed");
	}

	const blob = await response.blob();
	const url = window.URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	const dateStr = new Date().toISOString().split("T")[0];
	a.download = `spm-export-${dateStr}.zip`;
	a.click();
	window.URL.revokeObjectURL(url);
}
