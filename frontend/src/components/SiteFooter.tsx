import { useCheckVersion, useHealth } from "src/hooks";
import { T } from "src/locale";
import { showAboutModal } from "src/modals";

export function SiteFooter() {
	const health = useHealth();
	const { data: versionData } = useCheckVersion();

	const getVersion = () => {
		if (!health.data) {
			return "";
		}
		const v = health.data.version;
		return `v${v.major}.${v.minor}.${v.revision}`;
	};

	return (
		<footer className="footer d-print-none py-3">
			<div className="container-xl">
				<div className="row text-center align-items-center flex-row-reverse">
					<div className="col-lg-auto ms-lg-auto">
						<ul className="list-inline list-inline-dots mb-0">
							<li className="list-inline-item">
								<a
									href="https://gitea.2eagles.xyz/hft-applications/StarlaneProxyManager"
									target="_blank"
									className="link-secondary"
									rel="noopener"
								>
									StarlaneProxyManager
								</a>
							</li>
						</ul>
					</div>
					<div className="col-12 col-lg-auto mt-3 mt-lg-0">
						<ul className="list-inline list-inline-dots mb-0">
							<li className="list-inline-item">
								Powered by{" "}
								<a href="https://nginx.org" rel="noreferrer" target="_blank" className="link-secondary">
									Nginx
								</a>
							</li>
							<li className="list-inline-item">
								Theme by{" "}
								<a href="https://tabler.io" rel="noreferrer" target="_blank" className="link-secondary">
									Tabler
								</a>
							</li>
							<li className="list-inline-item">
								<span className="link-secondary">
									{" "}
									{getVersion()}{" "}
								</span>
							</li>
							<li className="list-inline-item">
								<a
									href="?"
									className="link-secondary"
									onClick={(e) => {
										e.preventDefault();
										showAboutModal();
									}}
								>
									<T id="about.link" />
								</a>
							</li>
							<li className="list-inline-item">
								<a
									href="/api/docs"
									className="link-secondary"
									target="_blank"
									rel="noopener"
								>
									API Docs
								</a>
							</li>
							{versionData?.updateAvailable && versionData?.latest && (
								<li className="list-inline-item">
									<a
										href={`https://github.com/NginxProxyManager/nginx-proxy-manager/releases/tag/${versionData.latest}`}
										className="link-warning fw-bold"
										target="_blank"
										rel="noopener"
										title={`NPM Base Update: ${versionData.latest} available`}
									>
										<T id="npm-base-update-available" data={{ latestVersion: versionData.latest }} />
									</a>
								</li>
							)}
						</ul>
					</div>
				</div>
			</div>
		</footer>
	);
}
