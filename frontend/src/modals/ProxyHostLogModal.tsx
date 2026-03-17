import { IconRefresh } from "@tabler/icons-react";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { useState } from "react";
import Modal from "react-bootstrap/Modal";
import Tab from "react-bootstrap/Tab";
import Tabs from "react-bootstrap/Tabs";
import { Button, LogViewer } from "src/components";
import { useProxyHostAccessLog, useProxyHostErrorLog } from "src/hooks";
import { T } from "src/locale";

interface Props extends InnerModalProps {
	hostId: number;
	hostName: string;
}

const ProxyHostLogModal = EasyModal.create(({ hostId, hostName, visible, remove }: Props) => {
	const [activeTab, setActiveTab] = useState<string>("access");
	const [lines, setLines] = useState<number>(100);
	const [search, setSearch] = useState<string>("");
	const [autoRefresh, setAutoRefresh] = useState<boolean>(false);

	const accessLog = useProxyHostAccessLog(hostId, lines, search || undefined, {
		enabled: visible && activeTab === "access",
		refetchInterval: autoRefresh ? 5000 : false,
	});

	const errorLog = useProxyHostErrorLog(hostId, lines, search || undefined, {
		enabled: visible && activeTab === "error",
		refetchInterval: autoRefresh ? 5000 : false,
	});

	const currentLog = activeTab === "access" ? accessLog : errorLog;

	return (
		<Modal show={visible} onHide={remove} size="xl">
			<Modal.Header closeButton>
				<Modal.Title>
					<T id="logs.view-logs" /> - {hostName}
				</Modal.Title>
			</Modal.Header>
			<Modal.Body>
				{/* Controls */}
				<div className="row g-2 mb-3">
					<div className="col-auto">
						<select
							className="form-select form-select-sm"
							value={lines}
							onChange={(e) => setLines(Number(e.target.value))}
						>
							<option value={50}>50 <T id="logs.lines" /></option>
							<option value={100}>100</option>
							<option value={250}>250</option>
							<option value={500}>500</option>
							<option value={1000}>1000</option>
						</select>
					</div>
					<div className="col">
						<input
							type="text"
							className="form-control form-control-sm"
							placeholder="Search..."
							value={search}
							onChange={(e) => setSearch(e.target.value)}
						/>
					</div>
					<div className="col-auto">
						<label className="form-check form-switch mb-0 mt-1">
							<input
								className="form-check-input"
								type="checkbox"
								checked={autoRefresh}
								onChange={(e) => setAutoRefresh(e.target.checked)}
							/>
							<span className="form-check-label">
								<T id="logs.auto-refresh" />
							</span>
						</label>
					</div>
					<div className="col-auto">
						<button
							type="button"
							className="btn btn-sm btn-ghost-secondary"
							onClick={() => currentLog.refetch()}
							disabled={currentLog.isFetching}
						>
							<IconRefresh size={16} className={currentLog.isFetching ? "spin" : ""} />
							<span className="ms-1">
								<T id="logs.refresh" />
							</span>
						</button>
					</div>
				</div>

				{/* Tabs */}
				<Tabs
					activeKey={activeTab}
					onSelect={(k) => k && setActiveTab(k)}
					className="mb-3"
				>
					<Tab eventKey="access" title={<T id="logs.access-log" />}>
						<LogViewer
							lines={accessLog.data?.lines ?? []}
							isLoading={accessLog.isLoading}
							totalSize={accessLog.data?.totalSize}
							searchText={search}
						/>
					</Tab>
					<Tab eventKey="error" title={<T id="logs.error-log" />}>
						<LogViewer
							lines={errorLog.data?.lines ?? []}
							isLoading={errorLog.isLoading}
							totalSize={errorLog.data?.totalSize}
							searchText={search}
						/>
					</Tab>
				</Tabs>
			</Modal.Body>
			<Modal.Footer>
				<Button data-bs-dismiss="modal" onClick={remove}>
					<T id="action.close" />
				</Button>
			</Modal.Footer>
		</Modal>
	);
});

const showProxyHostLogModal = (hostId: number, hostName: string) => {
	EasyModal.show(ProxyHostLogModal, { hostId, hostName });
};

export { showProxyHostLogModal };
