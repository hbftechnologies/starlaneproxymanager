import type { ConflictResolution } from "src/api/backend/importCommit";
import type { ImportConflict, ImportPreviewResult, ImportSummaryItem } from "src/api/backend/importPreview";
import { T } from "src/locale";

interface PreviewTableProps {
	preview: ImportPreviewResult;
	resolutions: ConflictResolution[];
	onResolutionChange: (index: number, action: ConflictResolution["action"]) => void;
}

const TYPE_LABELS: Record<string, string> = {
	access_lists: "access-lists",
	certificates: "certificates",
	proxy_hosts: "proxy-hosts",
	redirection_hosts: "redirection-hosts",
	dead_hosts: "dead-hosts",
	streams: "streams",
	settings: "settings",
};

const CONFLICT_TYPE_LABELS: Record<string, string> = {
	access_list: "Access List",
	certificate: "Certificate",
	proxy_host: "Proxy Host",
	redirection_host: "Redirection Host",
	dead_host: "404 Host",
	stream: "Stream",
};

function PreviewTable({ preview, resolutions, onResolutionChange }: PreviewTableProps) {
	const summaryEntries = Object.entries(preview.summary).filter(
		([, value]) => (value as ImportSummaryItem).total > 0,
	);

	return (
		<div>
			{/* Summary Table */}
			<div className="mb-3">
				<h4>
					<T id="import_export.summary" />
				</h4>
				<table className="table table-sm table-striped">
					<thead>
						<tr>
							<th><T id="column.name" /></th>
							<th><T id="import_export.total" /></th>
							<th><T id="import_export.new_items" /></th>
							<th><T id="import_export.conflicts" /></th>
						</tr>
					</thead>
					<tbody>
						{summaryEntries.map(([key, value]) => {
							const summary = value as ImportSummaryItem;
							return (
								<tr key={key}>
									<td>
										<T id={TYPE_LABELS[key] || key} />
									</td>
									<td>{summary.total}</td>
									<td>
										<span className="badge bg-success">{summary.new}</span>
									</td>
									<td>
										{summary.conflict > 0 ? (
											<span className="badge bg-warning text-dark">{summary.conflict}</span>
										) : (
											<span className="badge bg-secondary">0</span>
										)}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>

			{/* Conflicts */}
			{preview.conflicts && preview.conflicts.length > 0 && (
				<div className="mb-3">
					<h4>
						<T id="import_export.conflicts" />
					</h4>
					<table className="table table-sm">
						<thead>
							<tr>
								<th><T id="column.name" /></th>
								<th><T id="column.details" /></th>
								<th><T id="import_export.resolution" /></th>
							</tr>
						</thead>
						<tbody>
							{preview.conflicts.map((conflict: ImportConflict, index: number) => (
								<tr key={`${conflict.type}-${conflict.importIndex}`}>
									<td>
										{CONFLICT_TYPE_LABELS[conflict.type] || conflict.type}
									</td>
									<td>
										{conflict.domainNames && conflict.domainNames.join(", ")}
										{conflict.name && conflict.name}
										{conflict.incomingPort && `Port ${conflict.incomingPort}`}
										{conflict.provider && ` (${conflict.provider})`}
									</td>
									<td>
										<select
											className="form-select form-select-sm"
											value={resolutions[index]?.action || "skip"}
											onChange={(e) =>
												onResolutionChange(
													index,
													e.target.value as ConflictResolution["action"],
												)
											}
										>
											<option value="skip">
												Skip
											</option>
											<option value="overwrite">
												Overwrite
											</option>
											{conflict.type === "certificate" && (
												<option value="use_existing">
													Use Existing
												</option>
											)}
										</select>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}

export default PreviewTable;
