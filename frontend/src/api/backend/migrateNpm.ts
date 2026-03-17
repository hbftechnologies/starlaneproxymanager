import AuthStore from "src/modules/AuthStore";
import type { ImportPreviewResult } from "./importPreview";

export async function migrateNpm(file: File): Promise<ImportPreviewResult> {
	const formData = new FormData();
	formData.append("database", file);

	const headers: Record<string, string> = {};
	if (AuthStore.token) {
		headers.Authorization = `Bearer ${AuthStore.token.token}`;
	}

	const response = await fetch("/api/import-export/migrate/npm", {
		method: "POST",
		headers,
		body: formData,
	});

	if (!response.ok) {
		const payload = await response.json();
		throw new Error(payload?.error?.message || "Migration failed");
	}

	return await response.json();
}
