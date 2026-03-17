import { IconDownload } from "@tabler/icons-react";
import { useState } from "react";
import { exportConfig, exportConfigZip } from "src/api/backend";
import { T } from "src/locale";

const EXPORT_TYPES = [
	{ key: "proxy_hosts", labelId: "proxy-hosts" },
	{ key: "redirection_hosts", labelId: "redirection-hosts" },
	{ key: "dead_hosts", labelId: "dead-hosts" },
	{ key: "streams", labelId: "streams" },
	{ key: "access_lists", labelId: "access-lists" },
	{ key: "certificates", labelId: "certificates" },
	{ key: "settings", labelId: "settings" },
];

function ExportTab() {
	const [selectedTypes, setSelectedTypes] = useState<string[]>(EXPORT_TYPES.map((t) => t.key));
	const [includeCerts, setIncludeCerts] = useState(false);
	const [isExporting, setIsExporting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const toggleType = (key: string) => {
		setSelectedTypes((prev) =>
			prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
		);
	};

	const handleExport = async () => {
		setIsExporting(true);
		setError(null);

		try {
			if (includeCerts) {
				await exportConfigZip({
					type: "full",
					includeTypes: selectedTypes,
				});
			} else {
				const data = await exportConfig({
					type: "full",
					includeTypes: selectedTypes,
				});

				// Trigger download of JSON
				const blob = new Blob([JSON.stringify(data, null, 2)], {
					type: "application/json",
				});
				const url = window.URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				const dateStr = new Date().toISOString().split("T")[0];
				a.download = `spm-export-${dateStr}.json`;
				a.click();
				window.URL.revokeObjectURL(url);
			}
		} catch (err: any) {
			setError(err.message || "Export failed");
		} finally {
			setIsExporting(false);
		}
	};

	return (
		<div>
			<h3 className="mb-3">
				<T id="import_export.export_options" />
			</h3>

			<div className="mb-3">
				<label className="form-label">
					<T id="import_export.select_types" />
				</label>
				<div className="row">
					{EXPORT_TYPES.map((type) => (
						<div key={type.key} className="col-md-4 col-sm-6 mb-2">
							<label className="form-check">
								<input
									className="form-check-input"
									type="checkbox"
									checked={selectedTypes.includes(type.key)}
									onChange={() => toggleType(type.key)}
								/>
								<span className="form-check-label">
									<T id={type.labelId} />
								</span>
							</label>
						</div>
					))}
				</div>
			</div>

			<div className="mb-3">
				<label className="form-check">
					<input
						className="form-check-input"
						type="checkbox"
						checked={includeCerts}
						onChange={(e) => setIncludeCerts(e.target.checked)}
					/>
					<span className="form-check-label">
						<T id="import_export.include_certificates" />
					</span>
				</label>
				{includeCerts && (
					<small className="text-muted d-block mt-1">
						<T id="import_export.include_certificates_note" />
					</small>
				)}
			</div>

			{error && (
				<div className="alert alert-danger" role="alert">
					{error}
				</div>
			)}

			<button
				type="button"
				className="btn btn-primary"
				disabled={isExporting || selectedTypes.length === 0}
				onClick={handleExport}
			>
				{isExporting ? (
					<span className="spinner-border spinner-border-sm me-2" />
				) : (
					<IconDownload className="me-2" size={18} />
				)}
				<T id="import_export.export_button" />
			</button>
		</div>
	);
}

export default ExportTab;
