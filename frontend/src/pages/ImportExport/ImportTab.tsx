import { IconUpload } from "@tabler/icons-react";
import { useRef, useState } from "react";
import { importCommit, importPreview, migrateNpm } from "src/api/backend";
import type { ConflictResolution, ImportCommitResult } from "src/api/backend/importCommit";
import type { ImportConflict, ImportPreviewResult } from "src/api/backend/importPreview";
import { T } from "src/locale";
import PreviewTable from "./PreviewTable";

function ImportTab() {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const npmFileInputRef = useRef<HTMLInputElement>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
	const [resolutions, setResolutions] = useState<ConflictResolution[]>([]);
	const [importResult, setImportResult] = useState<ImportCommitResult | null>(null);
	const [isCommitting, setIsCommitting] = useState(false);

	const handleFileUpload = async (file: File) => {
		setIsLoading(true);
		setError(null);
		setPreview(null);
		setImportResult(null);

		try {
			const result = await importPreview(file);
			setPreview(result);

			// Initialize resolutions with "skip" for all conflicts
			if (result.conflicts && result.conflicts.length > 0) {
				const defaultResolutions: ConflictResolution[] = result.conflicts.map(
					(conflict: ImportConflict) => ({
						type: conflict.type,
						importIndex: conflict.importIndex,
						action: "skip" as const,
					}),
				);
				setResolutions(defaultResolutions);
			} else {
				setResolutions([]);
			}
		} catch (err: any) {
			setError(err.message || "Failed to preview import");
		} finally {
			setIsLoading(false);
		}
	};

	const handleNpmMigration = async (file: File) => {
		setIsLoading(true);
		setError(null);
		setPreview(null);
		setImportResult(null);

		try {
			const result = await migrateNpm(file);
			setPreview(result);

			if (result.conflicts && result.conflicts.length > 0) {
				const defaultResolutions: ConflictResolution[] = result.conflicts.map(
					(conflict: ImportConflict) => ({
						type: conflict.type,
						importIndex: conflict.importIndex,
						action: "skip" as const,
					}),
				);
				setResolutions(defaultResolutions);
			} else {
				setResolutions([]);
			}
		} catch (err: any) {
			setError(err.message || "Failed to read NPM database");
		} finally {
			setIsLoading(false);
		}
	};

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) {
			handleFileUpload(file);
		}
	};

	const handleNpmFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) {
			handleNpmMigration(file);
		}
	};

	const updateResolution = (index: number, action: ConflictResolution["action"]) => {
		setResolutions((prev) => {
			const updated = [...prev];
			updated[index] = { ...updated[index], action };
			return updated;
		});
	};

	const handleCommit = async () => {
		if (!preview || !preview.payload) return;

		setIsCommitting(true);
		setError(null);

		try {
			const result = await importCommit({
				payload: preview.payload,
				resolutions: {
					conflicts: resolutions,
				},
			});
			setImportResult(result);
			setPreview(null);
		} catch (err: any) {
			setError(err.message || "Import failed");
		} finally {
			setIsCommitting(false);
		}
	};

	const resetState = () => {
		setPreview(null);
		setImportResult(null);
		setResolutions([]);
		setError(null);
		if (fileInputRef.current) fileInputRef.current.value = "";
		if (npmFileInputRef.current) npmFileInputRef.current.value = "";
	};

	return (
		<div>
			{/* Import Result */}
			{importResult && (
				<div className="mb-4">
					<div className="alert alert-success">
						<h4 className="alert-title">
							<T id="import_export.success" />
						</h4>
						<ImportResultSummary result={importResult} />
					</div>
					<button type="button" className="btn btn-secondary" onClick={resetState}>
						<T id="import_export.import_another" />
					</button>
				</div>
			)}

			{/* File Upload */}
			{!preview && !importResult && (
				<div>
					<div className="mb-4">
						<h3 className="mb-3">
							<T id="import_export.import_config" />
						</h3>
						<div className="mb-3">
							<label className="form-label">
								<T id="import_export.upload_file" />
							</label>
							<input
								ref={fileInputRef}
								type="file"
								className="form-control"
								accept=".json"
								onChange={handleFileChange}
								disabled={isLoading}
							/>
							<small className="text-muted">
								<T id="import_export.upload_file_note" />
							</small>
						</div>
					</div>

					<hr />

					<div className="mb-4">
						<h3 className="mb-3">
							<T id="import_export.npm_migration" />
						</h3>
						<p className="text-muted">
							<T id="import_export.npm_migration_description" />
						</p>
						<div className="mb-3">
							<label className="form-label">
								<T id="import_export.npm_upload" />
							</label>
							<input
								ref={npmFileInputRef}
								type="file"
								className="form-control"
								accept=".sqlite,.db"
								onChange={handleNpmFileChange}
								disabled={isLoading}
							/>
						</div>
					</div>

					{isLoading && (
						<div className="d-flex align-items-center">
							<span className="spinner-border spinner-border-sm me-2" />
							<T id="loading" />
						</div>
					)}
				</div>
			)}

			{/* Preview */}
			{preview && !importResult && (
				<div>
					<h3 className="mb-3">
						<T id="import_export.preview" />
					</h3>

					<PreviewTable
						preview={preview}
						resolutions={resolutions}
						onResolutionChange={updateResolution}
					/>

					<div className="mt-3 d-flex gap-2">
						<button
							type="button"
							className="btn btn-primary"
							disabled={isCommitting}
							onClick={handleCommit}
						>
							{isCommitting ? (
								<span className="spinner-border spinner-border-sm me-2" />
							) : (
								<IconUpload className="me-2" size={18} />
							)}
							<T id="import_export.import_button" />
						</button>
						<button type="button" className="btn btn-secondary" onClick={resetState}>
							<T id="cancel" />
						</button>
					</div>
				</div>
			)}

			{error && (
				<div className="alert alert-danger mt-3" role="alert">
					{error}
				</div>
			)}
		</div>
	);
}

function ImportResultSummary({ result }: { result: ImportCommitResult }) {
	const sections = [
		{ key: "proxyHosts", label: "proxy-hosts" },
		{ key: "redirectionHosts", label: "redirection-hosts" },
		{ key: "deadHosts", label: "dead-hosts" },
		{ key: "streams", label: "streams" },
		{ key: "accessLists", label: "access-lists" },
		{ key: "certificates", label: "certificates" },
		{ key: "settings", label: "settings" },
	];

	return (
		<div className="mt-2">
			<table className="table table-sm">
				<thead>
					<tr>
						<th><T id="column.name" /></th>
						<th><T id="import_export.result_created" /></th>
						<th><T id="import_export.result_skipped" /></th>
						<th><T id="import_export.result_overwritten" /></th>
					</tr>
				</thead>
				<tbody>
					{sections.map((section) => {
						const data = (result as any)[section.key];
						if (!data) return null;
						return (
							<tr key={section.key}>
								<td><T id={section.label} /></td>
								<td>{data.created || data.updated || 0}</td>
								<td>{data.skipped || 0}</td>
								<td>{data.overwritten || data.usedExisting || 0}</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}

export default ImportTab;
