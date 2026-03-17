/**
 * Seed OIDC configuration setting for SSO support.
 * Uses the existing `setting` table — no schema changes needed.
 *
 * If OIDC_ISSUER_URL, OIDC_CLIENT_ID, and OIDC_CLIENT_SECRET env vars are set,
 * the setting is created in "enabled" state with those values. This allows
 * fully automated OIDC setup via docker-compose without touching the admin UI.
 */
export function up(knex) {
	return knex("setting")
		.where("id", "oidc-config")
		.first()
		.then((existing) => {
			if (existing) return;

			const envIssuer = process.env.OIDC_ISSUER_URL || "";
			const envClientId = process.env.OIDC_CLIENT_ID || "";
			const envClientSecret = process.env.OIDC_CLIENT_SECRET || "";
			const envScopes = process.env.OIDC_SCOPES || "openid email profile";
			const envAutoCreate = process.env.OIDC_AUTO_CREATE_USER === "true";
			const envButtonLabel = process.env.OIDC_BUTTON_LABEL || "Sign in with SSO";

			// Auto-enable if all required env vars are present
			const autoEnabled = !!(envIssuer && envClientId && envClientSecret);

			return knex("setting").insert({
				id: "oidc-config",
				name: "OIDC Configuration",
				description: "OpenID Connect SSO configuration",
				value: autoEnabled ? "enabled" : "disabled",
				meta: JSON.stringify({
					issuer_url: envIssuer,
					client_id: envClientId,
					client_secret: envClientSecret,
					scopes: envScopes,
					auto_create_user: envAutoCreate,
					default_role: "user",
					claim_email: "email",
					claim_name: "name",
					claim_nickname: "preferred_username",
					button_label: envButtonLabel,
					oidc_only: false,
				}),
			});
		});
}

export function down(knex) {
	return knex("setting").where("id", "oidc-config").del();
}
