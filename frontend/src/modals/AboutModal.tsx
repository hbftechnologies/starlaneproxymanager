import EasyModal, { type InnerModalProps } from "ez-modal-react";
import Modal from "react-bootstrap/Modal";
import { Button, ThemedLogo } from "src/components";
import { useCheckVersion, useHealth } from "src/hooks";
import { T } from "src/locale";

const UPSTREAM_URL = "https://github.com/NginxProxyManager/nginx-proxy-manager";
const REPO_URL = "https://gitea.2eagles.xyz/hft-applications/StarlaneProxyManager";

const showAboutModal = () => {
	EasyModal.show(AboutModal);
};

const AboutModal = EasyModal.create(({ visible, remove }: InnerModalProps) => {
	const health = useHealth();
	const { data: versionData } = useCheckVersion();

	const spmVersion = health.data
		? `${health.data.version.major}.${health.data.version.minor}.${health.data.version.revision}`
		: "";

	const npmBaseVersion = versionData?.current ?? "";

	return (
		<Modal show={visible} onHide={remove}>
			<Modal.Header closeButton>
				<Modal.Title>
					<T id="about.title" />
				</Modal.Title>
			</Modal.Header>
			<Modal.Body className="text-center">
				<div className="mb-3">
					<ThemedLogo width={140} height={140} />
				</div>
				<h4 className="mb-1">Starlane Proxy Manager</h4>
				{spmVersion && (
					<p className="text-secondary mb-1">
						<T id="about.version" data={{ version: `v${spmVersion}` }} />
					</p>
				)}
				{npmBaseVersion && (
					<p className="text-secondary mb-3">
						<T id="about.based-on" data={{ version: npmBaseVersion }} />
					</p>
				)}
				<p className="mb-2">
					<T
						id="about.fork-notice"
						data={{ link: "NGINX Proxy Manager" }}
					/>{" "}
					<a href={UPSTREAM_URL} target="_blank" rel="noopener noreferrer" className="link-secondary">
						View upstream project
					</a>
				</p>
				<p className="text-secondary mb-2">
					<T id="about.license" />
				</p>
				<p className="mb-2">
					<T id="about.maintained-by" data={{ name: "Harley Technologies" }} />
				</p>
				<div className="mt-3">
					<a
						href={REPO_URL}
						target="_blank"
						rel="noopener noreferrer"
						className="btn btn-outline-secondary btn-sm me-2"
					>
						Gitea Repository
					</a>
					<a
						href={UPSTREAM_URL}
						target="_blank"
						rel="noopener noreferrer"
						className="btn btn-outline-secondary btn-sm"
					>
						Upstream NPM
					</a>
				</div>
			</Modal.Body>
			<Modal.Footer>
				<Button
					type="button"
					actionType="primary"
					className="ms-auto"
					data-bs-dismiss="modal"
					onClick={remove}
				>
					<T id="action.close" />
				</Button>
			</Modal.Footer>
		</Modal>
	);
});

export { showAboutModal };
