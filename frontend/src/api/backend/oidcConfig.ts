import * as api from "./base";

export interface OIDCPublicConfig {
	enabled: boolean;
	buttonLabel: string;
	showPasswordForm: boolean;
}

export interface OIDCSettings {
	id: string;
	value: string;
	meta: {
		issuerUrl: string;
		clientId: string;
		clientSecret: string;
		scopes: string;
		autoCreateUser: boolean;
		defaultRole: string;
		claimEmail: string;
		claimName: string;
		claimNickname: string;
		buttonLabel: string;
		oidcOnly: boolean;
		baseUrl: string;
	};
}

export interface OIDCTestResult {
	success: boolean;
	error?: string;
	metadata?: {
		issuer: string;
		authorizationEndpoint: string;
		tokenEndpoint: string;
		userinfoEndpoint: string;
		scopesSupported: string[];
	};
}

/**
 * Public endpoint — no auth required.
 * Used by the login page to check if SSO is enabled.
 */
export async function getOIDCConfig(): Promise<OIDCPublicConfig> {
	const response = await fetch("/api/auth/oidc/config");
	const data = await response.json();
	return {
		enabled: data.enabled,
		buttonLabel: data.button_label,
		showPasswordForm: data.show_password_form,
	};
}

/**
 * Admin endpoint — get full OIDC settings (secret is masked).
 */
export async function getOIDCSettings(): Promise<OIDCSettings> {
	return await api.get({ url: "/auth/oidc/settings" });
}

/**
 * Admin endpoint — update OIDC settings.
 */
export async function updateOIDCSettings(data: {
	enabled: boolean;
	issuerUrl: string;
	clientId: string;
	clientSecret: string;
	scopes: string;
	autoCreateUser: boolean;
	defaultRole: string;
	claimEmail: string;
	claimName: string;
	claimNickname: string;
	buttonLabel: string;
	oidcOnly: boolean;
	baseUrl: string;
}): Promise<OIDCSettings> {
	return await api.put({
		url: "/auth/oidc/settings",
		data,
	});
}

/**
 * Admin endpoint — test OIDC connection by performing discovery.
 */
export async function testOIDCConnection(): Promise<OIDCTestResult> {
	return await api.post({ url: "/auth/oidc/test" });
}
