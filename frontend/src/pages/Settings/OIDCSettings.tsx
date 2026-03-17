import { Field, Form, Formik } from "formik";
import { type ReactNode, useState } from "react";
import { Alert } from "react-bootstrap";
import { Button, Loading } from "src/components";
import {
	getOIDCSettings,
	updateOIDCSettings,
	testOIDCConnection,
	type OIDCSettings as OIDCSettingsType,
	type OIDCTestResult,
} from "src/api/backend";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { T } from "src/locale";

function CopyableField({ label, value }: { label: string; value: string }) {
	const [copied, setCopied] = useState(false);

	const handleCopy = () => {
		navigator.clipboard.writeText(value);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div className="mb-3">
			<label className="form-label">{label}</label>
			<div className="input-group">
				<input
					type="text"
					className="form-control"
					value={value}
					readOnly
					onClick={(e) => (e.target as HTMLInputElement).select()}
				/>
				<button
					type="button"
					className="btn btn-outline-secondary"
					onClick={handleCopy}
				>
					{copied ? "Copied!" : "Copy"}
				</button>
			</div>
		</div>
	);
}

export default function OIDCSettings() {
	const queryClient = useQueryClient();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [successMsg, setSuccessMsg] = useState<string | null>(null);
	const [testResult, setTestResult] = useState<OIDCTestResult | null>(null);
	const [showAdvanced, setShowAdvanced] = useState(false);

	const getCallbackUrl = (baseUrl?: string) => {
		const base = baseUrl?.replace(/\/+$/, "") || window.location.origin;
		return `${base}/api/auth/oidc/callback`;
	};

	const { data, isLoading, error } = useQuery<OIDCSettingsType, Error>({
		queryKey: ["setting", "oidc-config"],
		queryFn: getOIDCSettings,
		staleTime: 60 * 1000,
	});

	const saveMutation = useMutation({
		mutationFn: updateOIDCSettings,
		onSuccess: () => {
			setSuccessMsg("OIDC settings saved");
			queryClient.invalidateQueries({ queryKey: ["setting", "oidc-config"] });
			setTimeout(() => setSuccessMsg(null), 3000);
		},
		onError: (err: Error) => {
			setErrorMsg(err.message);
		},
	});

	const testMutation = useMutation({
		mutationFn: testOIDCConnection,
		onSuccess: (result) => {
			setTestResult(result);
		},
		onError: (err: Error) => {
			setTestResult({ success: false, error: err.message });
		},
	});

	if (!isLoading && error) {
		return (
			<div className="card-body">
				<Alert variant="danger">{error.message}</Alert>
			</div>
		);
	}

	if (isLoading || !data) {
		return (
			<div className="card-body">
				<Loading noLogo />
			</div>
		);
	}

	const initialValues = {
		enabled: data.value === "enabled",
		issuerUrl: data.meta?.issuerUrl || "",
		clientId: data.meta?.clientId || "",
		clientSecret: data.meta?.clientSecret || "",
		scopes: data.meta?.scopes || "openid email profile",
		autoCreateUser: data.meta?.autoCreateUser || false,
		defaultRole: data.meta?.defaultRole || "user",
		claimEmail: data.meta?.claimEmail || "email",
		claimName: data.meta?.claimName || "name",
		claimNickname: data.meta?.claimNickname || "preferred_username",
		buttonLabel: data.meta?.buttonLabel || "Sign in with SSO",
		oidcOnly: data.meta?.oidcOnly || false,
		baseUrl: data.meta?.baseUrl || "",
	};

	return (
		<Formik
			initialValues={initialValues}
			enableReinitialize
			onSubmit={(values, { setSubmitting }) => {
				setErrorMsg(null);
				saveMutation.mutate(values, {
					onSettled: () => setSubmitting(false),
				});
			}}
		>
			{({ values, isSubmitting }) => (
				<Form>
					<div className="card-body">
						{errorMsg && (
							<Alert variant="danger" dismissible onClose={() => setErrorMsg(null)}>
								{errorMsg}
							</Alert>
						)}
						{successMsg && (
							<Alert variant="success" dismissible onClose={() => setSuccessMsg(null)}>
								<T id="settings.oidc.saved" />
							</Alert>
						)}

						{/* Enable toggle */}
						<div className="mb-3">
							<label className="form-check form-switch">
								<Field
									name="enabled"
									type="checkbox"
									className="form-check-input"
								/>
								<span className="form-check-label">
									<T id="settings.oidc.enable" />
								</span>
							</label>
						</div>

						{values.enabled && (
							<>
								{/* Callback URL — read-only, copy to configure in your OIDC provider */}
								<CopyableField
									label="Redirect URI (set this in your OIDC provider)"
									value={getCallbackUrl(values.baseUrl)}
								/>

								{/* Base URL — used to construct the callback URL */}
								<div className="mb-3">
									<label className="form-label">
										Base URL
										<Field
											name="baseUrl"
											type="url"
											className="form-control"
											placeholder="https://spm.example.com"
										/>
										<small className="form-hint">
											The external URL users access SPM at. Used to construct the callback URL above.
											Leave empty to auto-detect from request headers (works behind a reverse proxy).
										</small>
									</label>
								</div>

								{/* Issuer URL */}
								<div className="mb-3">
									<label className="form-label">
										<T id="settings.oidc.issuer-url" />
										<Field
											name="issuerUrl"
											type="url"
											className="form-control"
											placeholder="https://auth.example.com"
										/>
										<small className="form-hint">
											<T id="settings.oidc.issuer-url-help" />
											<br />
											<span className="text-muted">
												Pocket-ID: <code>https://pocket-id.example.com</code>
												{" | "}
												Authentik: <code>https://auth.example.com/application/o/spm/</code>
												{" | "}
												Keycloak: <code>https://kc.example.com/realms/your-realm</code>
											</span>
										</small>
									</label>
								</div>

								{/* Client ID */}
								<div className="mb-3">
									<label className="form-label">
										<T id="settings.oidc.client-id" />
										<Field
											name="clientId"
											type="text"
											className="form-control"
											placeholder="spm-client"
										/>
									</label>
								</div>

								{/* Client Secret */}
								<div className="mb-3">
									<label className="form-label">
										<T id="settings.oidc.client-secret" />
										<Field
											name="clientSecret"
											type="password"
											className="form-control"
											autoComplete="off"
										/>
									</label>
								</div>

								{/* Scopes */}
								<div className="mb-3">
									<label className="form-label">
										<T id="settings.oidc.scopes" />
										<Field
											name="scopes"
											type="text"
											className="form-control"
											placeholder="openid email profile"
										/>
									</label>
								</div>

								{/* Button Label */}
								<div className="mb-3">
									<label className="form-label">
										<T id="settings.oidc.button-label" />
										<Field
											name="buttonLabel"
											type="text"
											className="form-control"
											placeholder="Sign in with SSO"
										/>
										<small className="form-hint">
											<T id="settings.oidc.button-label-help" />
										</small>
									</label>
								</div>

								{/* Auto-create users */}
								<div className="mb-3">
									<label className="form-check form-switch">
										<Field
											name="autoCreateUser"
											type="checkbox"
											className="form-check-input"
										/>
										<span className="form-check-label">
											<T id="settings.oidc.auto-create" />
										</span>
									</label>
									<small className="form-hint">
										<T id="settings.oidc.auto-create-help" />
									</small>
								</div>

								{/* Default role */}
								{values.autoCreateUser && (
									<div className="mb-3">
										<label className="form-label">
											<T id="settings.oidc.default-role" />
											<Field
												as="select"
												name="defaultRole"
												className="form-select"
											>
												<option value="user">Standard User</option>
												<option value="admin">Administrator</option>
											</Field>
										</label>
									</div>
								)}

								{/* OIDC Only Mode */}
								<div className="mb-3">
									<label className="form-check form-switch">
										<Field
											name="oidcOnly"
											type="checkbox"
											className="form-check-input"
										/>
										<span className="form-check-label">
											<T id="settings.oidc.oidc-only" />
										</span>
									</label>
									<small className="form-hint">
										<T id="settings.oidc.oidc-only-help" />
									</small>
								</div>

								{/* Advanced: Claim Mappings */}
								<div className="mb-3">
									<button
										type="button"
										className="btn btn-sm btn-ghost-secondary"
										onClick={() => setShowAdvanced(!showAdvanced)}
									>
										<T id="settings.oidc.claim-mappings" /> {showAdvanced ? "▲" : "▼"}
									</button>
								</div>

								{showAdvanced && (
									<div className="ps-3 border-start mb-3">
										<div className="mb-3">
											<label className="form-label">
												<T id="settings.oidc.claim-email" />
												<Field
													name="claimEmail"
													type="text"
													className="form-control"
													placeholder="email"
												/>
											</label>
										</div>
										<div className="mb-3">
											<label className="form-label">
												<T id="settings.oidc.claim-name" />
												<Field
													name="claimName"
													type="text"
													className="form-control"
													placeholder="name"
												/>
											</label>
										</div>
										<div className="mb-3">
											<label className="form-label">
												<T id="settings.oidc.claim-nickname" />
												<Field
													name="claimNickname"
													type="text"
													className="form-control"
													placeholder="preferred_username"
												/>
											</label>
										</div>
									</div>
								)}

								{/* Test Connection */}
								<div className="mb-3">
									<Button
										type="button"
										color="cyan"
										isLoading={testMutation.isPending}
										onClick={() => {
											setTestResult(null);
											testMutation.mutate();
										}}
									>
										<T id="settings.oidc.test-connection" />
									</Button>
								</div>

								{testResult && (
									<Alert variant={testResult.success ? "success" : "danger"} dismissible onClose={() => setTestResult(null)}>
										{testResult.success ? (
											<>
												<T id="settings.oidc.test-success" />
												{testResult.metadata && (
													<div className="mt-2 small">
														<div>Issuer: {testResult.metadata.issuer}</div>
														<div>Authorization: {testResult.metadata.authorizationEndpoint}</div>
														<div>Token: {testResult.metadata.tokenEndpoint}</div>
														<div>Userinfo: {testResult.metadata.userinfoEndpoint}</div>
													</div>
												)}
											</>
										) : (
											<>
												<T id="settings.oidc.test-failure" />
												{testResult.error && (
													<div className="mt-1 small">{testResult.error}</div>
												)}
											</>
										)}
									</Alert>
								)}
							</>
						)}
					</div>
					<div className="card-footer bg-transparent mt-auto">
						<div className="btn-list justify-content-end">
							<Button
								type="submit"
								actionType="primary"
								className="ms-auto bg-teal"
								isLoading={isSubmitting}
								disabled={isSubmitting}
							>
								<T id="save" />
							</Button>
						</div>
					</div>
				</Form>
			)}
		</Formik>
	);
}
