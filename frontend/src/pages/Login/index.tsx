import { Field, Form, Formik } from "formik";
import { useEffect, useRef, useState } from "react";
import Alert from "react-bootstrap/Alert";
import { Button, LocalePicker, Page, ThemedLogo, ThemeSwitcher } from "src/components";
import { useAuthState } from "src/context";
import { useHealth } from "src/hooks";
import { intl, T } from "src/locale";
import { validateEmail, validateString } from "src/modules/Validations";
import { getOIDCConfig, type OIDCPublicConfig } from "src/api/backend";

function TwoFactorForm() {
	const codeRef = useRef<HTMLInputElement>(null);
	const [formErr, setFormErr] = useState("");
	const { verifyTwoFactor, cancelTwoFactor } = useAuthState();

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		setFormErr("");
		try {
			await verifyTwoFactor(values.code);
		} catch (err) {
			if (err instanceof Error) {
				setFormErr(err.message);
			}
		}
		setSubmitting(false);
	};

	useEffect(() => {
		codeRef.current?.focus();
	}, []);

	return (
		<>
			<h2 className="h2 text-center mb-4">
				<T id="login.2fa-title" />
			</h2>
			<p className="text-secondary text-center mb-4">
				<T id="login.2fa-description" />
			</p>
			{formErr !== "" && <Alert variant="danger">{formErr}</Alert>}
			<Formik initialValues={{ code: "" }} onSubmit={onSubmit}>
				{({ isSubmitting }) => (
					<Form>
						<div className="mb-3">
							<Field name="code" validate={validateString(6, 20)}>
								{({ field, form }: any) => (
									<label className="form-label">
										<T id="login.2fa-code" />
										<input
											{...field}
											ref={codeRef}
											type="text"
											inputMode="numeric"
											autoComplete="one-time-code"
											required
											maxLength={20}
											className={`form-control ${form.errors.code && form.touched.code ? "is-invalid" : ""}`}
											placeholder={intl.formatMessage({ id: "login.2fa-code-placeholder" })}
										/>
										<div className="invalid-feedback">{form.errors.code}</div>
									</label>
								)}
							</Field>
						</div>
						<div className="form-footer d-flex gap-2">
							<Button type="button" fullWidth onClick={cancelTwoFactor} disabled={isSubmitting}>
								<T id="cancel" />
							</Button>
							<Button type="submit" fullWidth color="azure" isLoading={isSubmitting}>
								<T id="login.2fa-verify" />
							</Button>
						</div>
					</Form>
				)}
			</Formik>
		</>
	);
}

function LoginForm({ oidcConfig }: { oidcConfig: OIDCPublicConfig | null }) {
	const emailRef = useRef<HTMLInputElement>(null);
	const [formErr, setFormErr] = useState("");
	const { login } = useAuthState();

	const showPasswordForm = !oidcConfig?.enabled || oidcConfig?.showPasswordForm;

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		setFormErr("");
		try {
			await login(values.email, values.password);
		} catch (err) {
			if (err instanceof Error) {
				setFormErr(err.message);
			}
		}
		setSubmitting(false);
	};

	useEffect(() => {
		if (showPasswordForm) {
			emailRef.current?.focus();
		}
	}, [showPasswordForm]);

	const handleSSOClick = () => {
		// Full page redirect to the OIDC login endpoint
		window.location.href = "/api/auth/oidc";
	};

	return (
		<>
			<h2 className="h2 text-center mb-4">
				<T id="login.title" />
			</h2>
			{formErr !== "" && <Alert variant="danger">{formErr}</Alert>}

			{/* SSO Button — shown when OIDC is enabled */}
			{oidcConfig?.enabled && (
				<>
					<div className="mb-3">
						<Button
							type="button"
							fullWidth
							color="purple"
							onClick={handleSSOClick}
						>
							{oidcConfig.buttonLabel || <T id="login.sso-button" />}
						</Button>
					</div>
					{showPasswordForm && (
						<div className="hr-text mb-3">
							<span><T id="login.sso-separator" /></span>
						</div>
					)}
				</>
			)}

			{/* Password form — hidden in OIDC-only mode */}
			{showPasswordForm && (
				<Formik
					initialValues={
						{
							email: "",
							password: "",
						} as any
					}
					onSubmit={onSubmit}
				>
					{({ isSubmitting }) => (
						<Form>
							<div className="mb-3">
								<Field name="email" validate={validateEmail()}>
									{({ field, form }: any) => (
										<label className="form-label">
											<T id="email-address" />
											<input
												{...field}
												ref={emailRef}
												type="email"
												required
												className={`form-control ${form.errors.email && form.touched.email ? " is-invalid" : ""}`}
												placeholder={intl.formatMessage({ id: "email-address" })}
											/>
											<div className="invalid-feedback">{form.errors.email}</div>
										</label>
									)}
								</Field>
							</div>
							<div className="mb-2">
								<Field name="password" validate={validateString(8, 255)}>
									{({ field, form }: any) => (
										<>
											<label className="form-label">
												<T id="password" />
												<input
													{...field}
													type="password"
													autoComplete="current-password"
													required
													maxLength={255}
													className={`form-control ${form.errors.password && form.touched.password ? " is-invalid" : ""}`}
													placeholder={intl.formatMessage({ id: "password" })}
												/>
												<div className="invalid-feedback">{form.errors.password}</div>
											</label>
										</>
									)}
								</Field>
							</div>
							<div className="form-footer">
								<Button type="submit" fullWidth color="azure" isLoading={isSubmitting}>
									<T id="sign-in" />
								</Button>
							</div>
						</Form>
					)}
				</Formik>
			)}
		</>
	);
}

export default function Login() {
	const { twoFactorChallenge, oidcError } = useAuthState();
	const health = useHealth();
	const [oidcConfig, setOidcConfig] = useState<OIDCPublicConfig | null>(null);
	const [dismissedOidcError, setDismissedOidcError] = useState(false);

	useEffect(() => {
		getOIDCConfig()
			.then(setOidcConfig)
			.catch((err) => {
				console.error("Failed to load OIDC config:", err);
			});
	}, []);

	const getVersion = () => {
		if (!health.data) {
			return "";
		}
		const v = health.data.version;
		return `v${v.major}.${v.minor}.${v.revision}`;
	};

	return (
		<Page className="page page-center">
			<div className="container container-tight py-4">
				<div className="text-center mb-4">
					<ThemedLogo width={128} height={128} />
					<h2 className="mt-2 mb-0" style={{ fontFamily: "'Exo 2', sans-serif", fontWeight: 600 }}>Starlane Proxy Manager</h2>
				</div>
				<div className="d-flex justify-content-end mb-2 pe-3">
					<div className="d-flex align-items-center gap-1">
						<LocalePicker />
						<ThemeSwitcher />
					</div>
				</div>
				<div className="card card-md">
					<div className="card-body">
						{oidcError && !dismissedOidcError && (
							<Alert variant="danger" dismissible onClose={() => setDismissedOidcError(true)}>
								<T id="login.sso-error" />: {oidcError}
							</Alert>
						)}
						{twoFactorChallenge ? <TwoFactorForm /> : <LoginForm oidcConfig={oidcConfig} />}
					</div>
				</div>
				<div className="text-center text-secondary mt-3">{getVersion()}</div>
			</div>
		</Page>
	);
}
