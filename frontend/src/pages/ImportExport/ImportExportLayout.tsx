import { useState } from "react";
import { T } from "src/locale";
import ExportTab from "./ExportTab";
import ImportTab from "./ImportTab";

function ImportExportLayout() {
	const [activeTab, setActiveTab] = useState<"export" | "import">("export");

	return (
		<div className="page-header d-print-none">
			<div className="container-xl">
				<div className="page-header">
					<div className="row align-items-center">
						<div className="col-auto">
							<h2 className="page-title">
								<T id="import_export.title" />
							</h2>
						</div>
					</div>
				</div>
				<div className="card">
					<div className="card-header">
						<ul className="nav nav-tabs card-header-tabs">
							<li className="nav-item">
								<button
									type="button"
									className={`nav-link ${activeTab === "export" ? "active" : ""}`}
									onClick={() => setActiveTab("export")}
								>
									<T id="import_export.export_tab" />
								</button>
							</li>
							<li className="nav-item">
								<button
									type="button"
									className={`nav-link ${activeTab === "import" ? "active" : ""}`}
									onClick={() => setActiveTab("import")}
								>
									<T id="import_export.import_tab" />
								</button>
							</li>
						</ul>
					</div>
					<div className="card-body">
						{activeTab === "export" && <ExportTab />}
						{activeTab === "import" && <ImportTab />}
					</div>
				</div>
			</div>
		</div>
	);
}

export default ImportExportLayout;
