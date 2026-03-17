import express from "express";
import internalOidc from "../internal/oidc.js";
import internalSetting from "../internal/setting.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import errs from "../lib/error.js";
import { debug, express as logger } from "../logger.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * Build the callback redirect URI.
 * Uses the configured base_url if set, otherwise falls back to request headers.
 * @param {Object} req  Express request
 * @param {Object} config  OIDC config from settings
 * @returns {string}
 */
async function getRedirectUri(req) {
	const config = await internalOidc.getConfig();

	// Prefer configured base_url if set (Finding #5: avoid header-based construction)
	if (config.base_url) {
		return `${config.base_url.replace(/\/+$/, "")}/api/auth/oidc/callback`;
	}

	// Fallback to request headers (safe behind a trusted reverse proxy)
	const proto = req.headers["x-forwarded-proto"] || req.protocol;
	const host = req.headers["x-forwarded-host"] || req.get("host");
	return `${proto}://${host}/api/auth/oidc/callback`;
}

/**
 * GET /api/auth/oidc/config
 *
 * Public endpoint — returns whether OIDC is enabled and the button label.
 * The login page calls this to decide whether to show the SSO button.
 * No authentication required.
 */
router.get("/config", async (req, res, next) => {
	try {
		const config = await internalOidc.getConfig();
		const enabled = await internalOidc.isEnabled();
		const showPasswordForm = await internalOidc.shouldShowPasswordForm();

		res.status(200).send({
			enabled,
			button_label: config.button_label || "Sign in with SSO",
			show_password_form: showPasswordForm,
		});
	} catch (err) {
		debug(logger, `GET /api/auth/oidc/config: ${err}`);
		next(err);
	}
});

/**
 * GET /api/auth/oidc
 *
 * Initiates the OIDC Authorization Code flow.
 * Redirects the user's browser to the OIDC provider's authorization endpoint.
 * No authentication required.
 */
router.get("/", async (req, res, next) => {
	try {
		const enabled = await internalOidc.isEnabled();
		if (!enabled) {
			res.status(404).send({ error: { message: "OIDC is not enabled" } });
			return;
		}

		const redirectUri = await getRedirectUri(req);
		const { url } = await internalOidc.getAuthorizationUrl(redirectUri);
		res.redirect(302, url);
	} catch (err) {
		debug(logger, `GET /api/auth/oidc: ${err}`);
		next(err);
	}
});

/**
 * GET /api/auth/oidc/callback
 *
 * Handles the OIDC provider's redirect after user authentication.
 * Exchanges the authorization code for tokens, finds/creates the user,
 * issues an SPM JWT, and redirects to the frontend with the token.
 * No authentication required.
 */
router.get("/callback", async (req, res, next) => {
	try {
		const state = req.query.state;
		if (!state) {
			res.redirect("/?oidc_error=missing_state");
			return;
		}

		if (req.query.error) {
			// Only pass through the error code, not the full description (Finding #6)
			const errorCode = req.query.error;
			res.redirect(`/?oidc_error=${encodeURIComponent(errorCode)}`);
			return;
		}

		// Reconstruct the full callback URL for openid-client validation
		const redirectUri = await getRedirectUri(req);
		// Replace the path to match what openid-client expects
		const callbackParams = new URLSearchParams(req.query).toString();
		const callbackUrl = `${redirectUri}?${callbackParams}`;

		const result = await internalOidc.handleCallback(callbackUrl, state);

		// Redirect to frontend with token in query params.
		// The frontend immediately stores in localStorage and clears the URL.
		res.redirect(`/?oidc_token=${encodeURIComponent(result.token)}&oidc_expires=${encodeURIComponent(result.expires)}`);
	} catch (err) {
		// Log full error server-side, send generic message to client (Finding #6)
		logger.error(`OIDC callback error: ${err.message}`, err.stack);

		// Only pass through AuthError messages (which we control), not library internals
		const message = err instanceof errs.AuthError
			? err.message
			: "Authentication failed. Please try again or contact your administrator.";
		res.redirect(`/?oidc_error=${encodeURIComponent(message)}`);
	}
});

/**
 * POST /api/auth/oidc/test
 *
 * Admin-only endpoint to test the OIDC configuration.
 * Performs discovery against the configured issuer URL and returns metadata.
 */
router
	.route("/test")
	.all(jwtdecode())
	.post(async (req, res, next) => {
		try {
			const metadata = await internalOidc.testConnection();
			res.status(200).send({
				success: true,
				metadata,
			});
		} catch (err) {
			debug(logger, `POST /api/auth/oidc/test: ${err}`);
			// Sanitize error: don't leak internal network details (Finding #10)
			const safeMessage = err.message?.includes("ECONNREFUSED") || err.message?.includes("ENOTFOUND")
				? "Could not reach the OIDC provider. Check the issuer URL and network connectivity."
				: err.message || "Connection test failed";
			res.status(400).send({
				success: false,
				error: safeMessage,
			});
		}
	});

/**
 * GET /api/auth/oidc/settings
 *
 * Admin-only endpoint to retrieve full OIDC configuration.
 * Client secret is masked in the response.
 */
router
	.route("/settings")
	.all(jwtdecode())
	.get(async (req, res, next) => {
		try {
			const row = await internalSetting.get(res.locals.access, { id: "oidc-config" });
			// Mask the client secret
			const response = { ...row };
			if (response.meta?.client_secret) {
				response.meta = {
					...response.meta,
					client_secret: response.meta.client_secret ? "********" : "",
				};
			}
			res.status(200).send(response);
		} catch (err) {
			debug(logger, `GET /api/auth/oidc/settings: ${err}`);
			next(err);
		}
	})

	/**
	 * PUT /api/auth/oidc/settings
	 *
	 * Admin-only endpoint to update OIDC configuration.
	 * If client_secret is "********", preserve the existing value.
	 */
	.put(async (req, res, next) => {
		try {
			const existingRow = await internalSetting.get(res.locals.access, { id: "oidc-config" });
			const payload = req.body;

			// Input validation (Finding #13)
			if (payload.issuer_url && typeof payload.issuer_url === "string" && payload.issuer_url.length > 0) {
				try {
					const url = new URL(payload.issuer_url);
					if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
						throw new Error("HTTPS required");
					}
				} catch {
					throw new errs.ValidationError("Issuer URL must be a valid HTTPS URL");
				}
			}

			if (payload.default_role && !["user", "admin"].includes(payload.default_role)) {
				throw new errs.ValidationError("Default role must be 'user' or 'admin'");
			}

			// Validate string field lengths
			const stringFields = ["client_id", "client_secret", "scopes", "button_label", "claim_email", "claim_name", "claim_nickname"];
			for (const field of stringFields) {
				if (payload[field] && typeof payload[field] === "string" && payload[field].length > 1000) {
					throw new errs.ValidationError(`${field} exceeds maximum length`);
				}
			}

			// Build the meta object
			const meta = {
				issuer_url: payload.issuer_url ?? existingRow.meta.issuer_url ?? "",
				client_id: payload.client_id ?? existingRow.meta.client_id ?? "",
				client_secret: payload.client_secret === "********"
					? existingRow.meta.client_secret
					: (payload.client_secret ?? existingRow.meta.client_secret ?? ""),
				scopes: payload.scopes ?? existingRow.meta.scopes ?? "openid email profile",
				auto_create_user: payload.auto_create_user ?? existingRow.meta.auto_create_user ?? false,
				default_role: payload.default_role ?? existingRow.meta.default_role ?? "user",
				claim_email: payload.claim_email ?? existingRow.meta.claim_email ?? "email",
				claim_name: payload.claim_name ?? existingRow.meta.claim_name ?? "name",
				claim_nickname: payload.claim_nickname ?? existingRow.meta.claim_nickname ?? "preferred_username",
				button_label: payload.button_label ?? existingRow.meta.button_label ?? "Sign in with SSO",
				oidc_only: payload.oidc_only ?? existingRow.meta.oidc_only ?? false,
				base_url: payload.base_url ?? existingRow.meta.base_url ?? "",
			};

			const value = payload.enabled ? "enabled" : "disabled";

			const result = await internalSetting.update(res.locals.access, {
				id: "oidc-config",
				value,
				meta,
			});

			// Clear the discovery cache so changes take effect immediately
			internalOidc.clearCache();

			// Mask secret in response
			const response = { ...result };
			if (response.meta?.client_secret) {
				response.meta = {
					...response.meta,
					client_secret: "********",
				};
			}

			res.status(200).send(response);
		} catch (err) {
			debug(logger, `PUT /api/auth/oidc/settings: ${err}`);
			next(err);
		}
	});

export default router;
