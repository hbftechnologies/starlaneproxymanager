import { IconDownload, IconFilter, IconFilterOff } from "@tabler/icons-react";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import type { AuditLogParams } from "src/api/backend";
import { exportAuditLogs } from "src/api/backend";
import { LoadingPage } from "src/components";
import { useAuditLogs, useUsers } from "src/hooks";
import { T } from "src/locale";
import { showEventDetailsModal } from "src/modals";
import Table from "./Table";

const ACTIONS = ["created", "updated", "deleted", "enabled", "disabled"];
const OBJECT_TYPES = ["proxy-host", "user", "certificate", "access-list", "stream", "dead-host", "redirection-host"];
const PAGE_SIZES = [25, 50, 100, 250];

export default function TableWrapper() {
	const [page, setPage] = useState(1);
	const [limit, setLimit] = useState(50);
	const [dateFrom, setDateFrom] = useState("");
	const [dateTo, setDateTo] = useState("");
	const [userId, setUserId] = useState<number | undefined>();
	const [action, setAction] = useState("");
	const [objectType, setObjectType] = useState("");
	const [showFilters, setShowFilters] = useState(false);

	const params: AuditLogParams = {
		page,
		limit,
		...(dateFrom ? { dateFrom } : {}),
		...(dateTo ? { dateTo } : {}),
		...(userId ? { userId } : {}),
		...(action ? { action } : {}),
		...(objectType ? { objectType } : {}),
	};

	const { isFetching, isLoading, isError, error, data } = useAuditLogs(["user"], params);
	const { data: users } = useUsers();

	const pagination = data?.pagination;
	const rows = data?.data ?? [];

	const hasActiveFilters = dateFrom || dateTo || userId || action || objectType;

	const clearFilters = () => {
		setDateFrom("");
		setDateTo("");
		setUserId(undefined);
		setAction("");
		setObjectType("");
		setPage(1);
	};

	const handleExport = async (format: "csv" | "json") => {
		try {
			await exportAuditLogs(format, params);
		} catch (err) {
			console.error("Export failed:", err);
		}
	};

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return <Alert variant="danger">{error?.message || "Unknown error"}</Alert>;
	}

	return (
		<div className="card mt-4">
			<div className="card-status-top bg-purple" />
			<div className="card-table">
				<div className="card-header">
					<div className="row w-full align-items-center">
						<div className="col">
							<h2 className="mt-1 mb-0">
								<T id="auditlogs" />
								{pagination && (
									<span className="text-muted ms-2 fs-5">
										({pagination.total})
									</span>
								)}
							</h2>
						</div>
						<div className="col-auto d-flex gap-2">
							<button
								type="button"
								className={`btn btn-sm ${showFilters ? "btn-primary" : "btn-ghost-secondary"}`}
								onClick={() => setShowFilters(!showFilters)}
							>
								<IconFilter size={16} />
								<span className="ms-1">
									<T id="audit-log.filter.title" />
								</span>
								{hasActiveFilters && (
									<span className="badge bg-yellow text-yellow-fg ms-1">!</span>
								)}
							</button>
							<div className="dropdown">
								<button
									type="button"
									className="btn btn-sm btn-ghost-secondary dropdown-toggle"
									data-bs-toggle="dropdown"
								>
									<IconDownload size={16} />
									<span className="ms-1">
										<T id="action.download" />
									</span>
								</button>
								<div className="dropdown-menu dropdown-menu-end">
									<a
										className="dropdown-item"
										href="#"
										onClick={(e) => {
											e.preventDefault();
											handleExport("csv");
										}}
									>
										<T id="audit-log.export.csv" />
									</a>
									<a
										className="dropdown-item"
										href="#"
										onClick={(e) => {
											e.preventDefault();
											handleExport("json");
										}}
									>
										<T id="audit-log.export.json" />
									</a>
								</div>
							</div>
						</div>
					</div>
				</div>

				{/* Filter Bar */}
				{showFilters && (
					<div className="card-body border-bottom py-3">
						<div className="row g-2 align-items-end">
							<div className="col-md-2">
								<label className="form-label small mb-1">
									<T id="audit-log.filter.date-from" />
								</label>
								<input
									type="datetime-local"
									className="form-control form-control-sm"
									value={dateFrom}
									onChange={(e) => {
										setDateFrom(e.target.value);
										setPage(1);
									}}
								/>
							</div>
							<div className="col-md-2">
								<label className="form-label small mb-1">
									<T id="audit-log.filter.date-to" />
								</label>
								<input
									type="datetime-local"
									className="form-control form-control-sm"
									value={dateTo}
									onChange={(e) => {
										setDateTo(e.target.value);
										setPage(1);
									}}
								/>
							</div>
							<div className="col-md-2">
								<label className="form-label small mb-1">
									<T id="audit-log.filter.user" />
								</label>
								<select
									className="form-select form-select-sm"
									value={userId ?? ""}
									onChange={(e) => {
										setUserId(e.target.value ? Number(e.target.value) : undefined);
										setPage(1);
									}}
								>
									<option value="">--</option>
									{users?.map((u) => (
										<option key={u.id} value={u.id}>
											{u.name} ({u.email})
										</option>
									))}
								</select>
							</div>
							<div className="col-md-2">
								<label className="form-label small mb-1">
									<T id="audit-log.filter.action" />
								</label>
								<select
									className="form-select form-select-sm"
									value={action}
									onChange={(e) => {
										setAction(e.target.value);
										setPage(1);
									}}
								>
									<option value="">--</option>
									{ACTIONS.map((a) => (
										<option key={a} value={a}>
											{a}
										</option>
									))}
								</select>
							</div>
							<div className="col-md-2">
								<label className="form-label small mb-1">
									<T id="audit-log.filter.object-type" />
								</label>
								<select
									className="form-select form-select-sm"
									value={objectType}
									onChange={(e) => {
										setObjectType(e.target.value);
										setPage(1);
									}}
								>
									<option value="">--</option>
									{OBJECT_TYPES.map((ot) => (
										<option key={ot} value={ot}>
											{ot}
										</option>
									))}
								</select>
							</div>
							<div className="col-md-2">
								{hasActiveFilters && (
									<button
										type="button"
										className="btn btn-sm btn-ghost-danger w-100"
										onClick={clearFilters}
									>
										<IconFilterOff size={16} />
										<span className="ms-1">
											<T id="audit-log.filter.clear" />
										</span>
									</button>
								)}
							</div>
						</div>
					</div>
				)}

				<Table data={rows} isFetching={isFetching} onSelectItem={showEventDetailsModal} />

				{/* Pagination Controls */}
				{pagination && pagination.totalPages > 0 && (
					<div className="card-footer d-flex align-items-center justify-content-between">
						<div className="d-flex align-items-center gap-2">
							<span className="text-muted small">
								<T id="audit-log.pagination.rows-per-page" />:
							</span>
							<select
								className="form-select form-select-sm"
								style={{ width: "auto" }}
								value={limit}
								onChange={(e) => {
									setLimit(Number(e.target.value));
									setPage(1);
								}}
							>
								{PAGE_SIZES.map((size) => (
									<option key={size} value={size}>
										{size}
									</option>
								))}
							</select>
						</div>
						<div className="d-flex align-items-center gap-2">
							<span className="text-muted small">
								<T
									id="audit-log.pagination.page-of"
									data={{ page: pagination.page, totalPages: pagination.totalPages }}
								/>
							</span>
							<div className="btn-group">
								<button
									type="button"
									className="btn btn-sm btn-outline-secondary"
									disabled={page <= 1}
									onClick={() => setPage(page - 1)}
								>
									&laquo;
								</button>
								<button
									type="button"
									className="btn btn-sm btn-outline-secondary"
									disabled={page >= pagination.totalPages}
									onClick={() => setPage(page + 1)}
								>
									&raquo;
								</button>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
