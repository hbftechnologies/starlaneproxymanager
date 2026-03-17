import crypto from "node:crypto";
import * as client from "openid-client";
import errs from "../lib/error.js";
import { getPrivateKey, getPublicKey } from "../lib/config.js";
import TokenModel from "../models/token.js";
import settingModel from "../models/setting.js";
import authModel from "../models/auth.js";
import userModel from "../models/user.js";
import userPermissionModel from "../models/user_permission.js";
import gravatar from "gravatar";
import jwt from "jsonwebtoken";
import { parseDatePeriod } from "../lib/helpers.js";
import internalAuditLog from "./audit-log.js";
import { global as logger } from "../logger.js";

// Cache the OIDC client configuration for 1 hour
let cachedConfig = null;
let configCacheTime = 0;
const CONFIG_CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Track used state JTIs to prevent replay within the 5-minute window
const usedStateJtis = new Map();
const STATE_JTI_CLEANUP_INTERVAL = 60 * 1000; // Clean up every minute

// Periodically clean expired JTIs
setInterval(() => {
	const now = Date.now();
	for (const [jti, expiry] of usedStateJtis) {
		if (expiry < now) {
			usedStateJtis.delete(jti);
		}
	}
}, STATE_JTI_CLEANUP_INTERVAL);

const internalOidc = {
	/**
	 * Load OIDC settings from the database.
	 * @returns {Promise<Object>} The OIDC config object
	 */
	getConfig: async () => {
		const row = await settingModel.query().where("id", "oidc-config").first();
		if (!row) {
			return { enabled: false };
		}
		return {
			enabled: row.value === "enabled",
			...row.meta,
		};
	},

	/**
	 * Check if OIDC is enabled and properly configured.
	 * @returns {Promise<boolean>}
	 */
	isEnabled: async () => {
		const config = await internalOidc.getConfig();
		return config.enabled && !!config.issuer_url && !!config.client_id && !!config.client_secret;
	},

	/**
	 * Whether the password form should be shown on the login page.
	 * In OIDC-only mode (no PASSWORD_FORM_SHOW env override), this returns false.
	 * @returns {Promise<boolean>}
	 */
	shouldShowPasswordForm: async () => {
		// Env var override always wins
		const envOverride = process.env.PASSWORD_FORM_SHOW;
		if (typeof envOverride !== "undefined") {
			return envOverride === "true" || envOverride === "1";
		}
		// If OIDC is not enabled, always show password form
		const enabled = await internalOidc.isEnabled();
		if (!enabled) {
			return true;
		}
		// Check oidc_only setting
		const config = await internalOidc.getConfig();
		return !config.oidc_only;
	},

	/**
	 * Perform OIDC discovery and return the server metadata.
	 * Results are cached for CONFIG_CACHE_TTL.
	 * @returns {Promise<Object>} OIDC server metadata
	 */
	discover: async () => {
		const config = await internalOidc.getConfig();
		if (!config.issuer_url) {
			throw new errs.ValidationError("OIDC issuer URL is not configured");
		}

		// Validate issuer URL is HTTPS (or localhost for development)
		const issuerUrl = new URL(config.issuer_url);
		if (issuerUrl.protocol !== "https:" && issuerUrl.hostname !== "localhost" && issuerUrl.hostname !== "127.0.0.1") {
			throw new errs.ValidationError("OIDC issuer URL must use HTTPS");
		}

		const now = Date.now();
		if (cachedConfig && configCacheTime + CONFIG_CACHE_TTL > now) {
			return cachedConfig;
		}

		cachedConfig = await client.discovery(issuerUrl, config.client_id, config.client_secret);
		configCacheTime = now;
		return cachedConfig;
	},

	/**
	 * Clear the cached OIDC discovery document.
	 * Called when settings are updated.
	 */
	clearCache: () => {
		cachedConfig = null;
		configCacheTime = 0;
	},

	/**
	 * Generate the OIDC authorization URL with state and PKCE.
	 * @param {string} redirectUri  The callback URL for this SPM instance
	 * @returns {Promise<{url: string, stateToken: string}>}
	 */
	getAuthorizationUrl: async (redirectUri) => {
		const config = await internalOidc.getConfig();
		const serverConfig = await internalOidc.discover();

		// Generate PKCE code verifier and challenge
		const codeVerifier = client.randomPKCECodeVerifier();
		const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);

		// Generate nonce for replay protection
		const nonce = client.randomNonce();

		// Create a signed state JWT that contains the PKCE code_verifier and nonce.
		// This avoids server-side session storage — same pattern as 2FA challenge tokens.
		const Token = TokenModel();
		const statePayload = await Token.create({
			iss: "oidc-state",
			attrs: {
				code_verifier: codeVerifier,
				nonce: nonce,
				redirect_uri: redirectUri,
			},
			scope: ["oidc-state"],
			expiresIn: "5m",
		});

		const scopes = (config.scopes || "openid email profile").split(" ");

		const authUrl = client.buildAuthorizationUrl(serverConfig, {
			redirect_uri: redirectUri,
			scope: scopes.join(" "),
			code_challenge: codeChallenge,
			code_challenge_method: "S256",
			state: statePayload.token,
			nonce: nonce,
		});

		return {
			url: authUrl.href,
			stateToken: statePayload.token,
		};
	},

	/**
	 * Handle the OIDC callback: validate state, exchange code, fetch user info.
	 * @param {string} callbackUrl     The full callback URL with query params
	 * @param {string} stateToken      The state JWT from the query params
	 * @returns {Promise<{token: string, expires: string}>}  SPM JWT
	 */
	handleCallback: async (callbackUrl, stateToken) => {
		const Token = TokenModel();

		// 1. Validate and decode the state JWT
		let stateData;
		try {
			stateData = await Token.load(stateToken);
		} catch {
			throw new errs.AuthError("Invalid or expired OIDC state");
		}

		if (!stateData.scope || stateData.scope[0] !== "oidc-state") {
			throw new errs.AuthError("Invalid OIDC state token");
		}

		// Enforce single-use: reject replayed state tokens (Finding #7)
		const jti = stateData.jti;
		if (jti && usedStateJtis.has(jti)) {
			throw new errs.AuthError("OIDC state has already been used");
		}
		if (jti) {
			// Mark as used, expires after 5 minutes (same as state JWT)
			usedStateJtis.set(jti, Date.now() + 5 * 60 * 1000);
		}

		const { code_verifier, nonce, redirect_uri } = stateData.attrs;

		// 2. Exchange authorization code for tokens
		const serverConfig = await internalOidc.discover();

		const tokens = await client.authorizationCodeGrant(serverConfig, new URL(callbackUrl), {
			pkceCodeVerifier: code_verifier,
			expectedNonce: nonce,
			expectedState: stateToken,
		});

		// 3. Fetch user claims from the ID token and userinfo endpoint
		const claims = tokens.claims();
		const config = await internalOidc.getConfig();
		const emailClaim = config.claim_email || "email";

		let userinfoClaims = {};
		try {
			userinfoClaims = await client.fetchUserInfo(serverConfig, tokens.access_token, claims.sub);
		} catch (err) {
			// Only fall back if the ID token has the required email claim (Finding #8)
			if (!claims[emailClaim]) {
				logger.error("Userinfo fetch failed and ID token missing email claim:", err.message);
				throw new errs.AuthError("Failed to retrieve user information from OIDC provider");
			}
			logger.warn("Userinfo fetch failed, using ID token claims:", err.message);
		}

		// Merge claims (userinfo takes precedence)
		const allClaims = { ...claims, ...userinfoClaims };

		// 4. Find or create the SPM user
		const user = await internalOidc.findOrCreateUser(allClaims, config);

		// 5. Issue SPM JWT using the same mechanism as password auth
		const expire = "1d";
		const expiry = parseDatePeriod(expire);

		const scope = user.roles && user.roles.indexOf("admin") !== -1 ? "admin" : "user";

		const signed = await Token.create({
			iss: "api",
			attrs: {
				id: user.id,
			},
			scope: [scope],
			expiresIn: expire,
		});

		// 6. Audit log the OIDC login (Finding #9: log at error level on failure)
		try {
			await internalAuditLog.add(
				{
					can: () => Promise.resolve(),
					token: { getUserId: () => user.id },
				},
				{
					action: "created",
					object_type: "token",
					object_id: user.id,
					meta: {
						auth_type: "oidc",
						email: user.email,
						name: user.name,
						oidc_sub: allClaims.sub,
					},
				},
			);
		} catch (err) {
			logger.error("SECURITY: Failed to log OIDC login to audit log:", err.message);
		}

		return {
			token: signed.token,
			expires: expiry.toISOString(),
		};
	},

	/**
	 * Find an existing user by OIDC sub claim, or by email, or create a new one.
	 *
	 * Security: Email-based linking NEVER auto-links to admin accounts.
	 * Admin accounts must be linked manually or via sub-claim match.
	 *
	 * @param {Object} claims  OIDC claims (sub, email, name, preferred_username, etc.)
	 * @param {Object} config  OIDC config from settings
	 * @returns {Promise<Object>} The SPM user
	 */
	findOrCreateUser: async (claims, config) => {
		const sub = claims.sub;
		if (!sub) {
			throw new errs.AuthError("OIDC response missing 'sub' claim");
		}

		const email = claims[config.claim_email || "email"];
		const name = claims[config.claim_name || "name"] || claims.preferred_username || email || "OIDC User";
		const nickname = claims[config.claim_nickname || "preferred_username"] || name;

		// 1. Look up by OIDC sub claim in auth table (always safe — exact identity match)
		const existingAuth = await authModel
			.query()
			.where("type", "oidc")
			.where("secret", sub)
			.where("is_deleted", 0)
			.withGraphFetched("user")
			.first();

		if (existingAuth?.user) {
			const user = existingAuth.user;
			if (user.is_deleted) {
				throw new errs.AuthError("User account has been deleted");
			}
			if (user.is_disabled) {
				throw new errs.AuthError("User account has been disabled");
			}

			// Update claims metadata on each login
			await authModel
				.query()
				.where("id", existingAuth.id)
				.patch({
					meta: {
						issuer: config.issuer_url,
						preferred_username: nickname,
						last_login: new Date().toISOString(),
					},
				});

			return user;
		}

		// 2. Look up by email to link an existing NON-ADMIN account (Finding #1)
		//    Admin accounts are NEVER auto-linked via email — this prevents
		//    privilege escalation via spoofed email claims from the OIDC provider.
		if (email) {
			const existingUser = await userModel
				.query()
				.where("email", email.toLowerCase().trim())
				.where("is_deleted", 0)
				.first();

			if (existingUser) {
				if (existingUser.is_disabled) {
					throw new errs.AuthError("User account has been disabled");
				}

				// SECURITY: Refuse to auto-link admin accounts via email claim
				const isAdmin = existingUser.roles && existingUser.roles.indexOf("admin") !== -1;
				if (isAdmin) {
					logger.warn(
						`SECURITY: Blocked OIDC email-based linking to admin account ${existingUser.email} (sub=${sub}). ` +
						`Admin accounts must be linked via the admin UI or by matching sub claim.`
					);
					throw new errs.AuthError(
						"Cannot auto-link to an administrator account. Ask your admin to link your OIDC identity manually.",
					);
				}

				// Link OIDC identity to existing non-admin user
				await authModel.query().insert({
					user_id: existingUser.id,
					type: "oidc",
					secret: sub,
					meta: {
						issuer: config.issuer_url,
						preferred_username: nickname,
						last_login: new Date().toISOString(),
					},
				});

				logger.warn(`OIDC account linked: identity sub=${sub} → existing user ${existingUser.email} (id=${existingUser.id})`);
				return existingUser;
			}
		}

		// 3. Auto-create if enabled
		if (!config.auto_create_user) {
			throw new errs.AuthError(
				"No account found for this OIDC identity. Contact your administrator.",
			);
		}

		if (!email) {
			throw new errs.AuthError("OIDC response missing email claim — cannot create account");
		}

		// Finding #4: Log a warning when auto-creating with admin role
		const isAdmin = config.default_role === "admin";
		if (isAdmin) {
			logger.warn(`SECURITY: Auto-creating OIDC user ${email} with ADMIN role (sub=${sub}). ` +
				`Consider changing default_role to 'user' in OIDC settings.`);
		}
		const roles = isAdmin ? ["admin"] : [];

		const newUser = await userModel.query().insertAndFetch({
			email: email.toLowerCase().trim(),
			name: name,
			nickname: nickname,
			avatar: gravatar.url(email, { default: "mm" }),
			roles: roles,
		});

		// Create auth entry
		await authModel.query().insert({
			user_id: newUser.id,
			type: "oidc",
			secret: sub,
			meta: {
				issuer: config.issuer_url,
				preferred_username: nickname,
				last_login: new Date().toISOString(),
			},
		});

		// Create permissions
		await userPermissionModel.query().insert({
			user_id: newUser.id,
			visibility: isAdmin ? "all" : "user",
			proxy_hosts: "manage",
			redirection_hosts: "manage",
			dead_hosts: "manage",
			streams: "manage",
			access_lists: "manage",
			certificates: "manage",
		});

		logger.info(`Auto-created user ${newUser.email} via OIDC (sub=${sub}, role=${isAdmin ? "admin" : "user"})`);
		return newUser;
	},

	/**
	 * Test the OIDC configuration by performing discovery.
	 * Only fetches the well-known document — does not pass credentials. (Finding #10)
	 * @returns {Promise<Object>} Discovery document metadata summary
	 */
	testConnection: async () => {
		internalOidc.clearCache();
		const config = await internalOidc.getConfig();

		if (!config.issuer_url) {
			throw new errs.ValidationError("Issuer URL is not configured");
		}

		const issuerUrl = new URL(config.issuer_url);

		// Validate HTTPS (or localhost for development)
		if (issuerUrl.protocol !== "https:" && issuerUrl.hostname !== "localhost" && issuerUrl.hostname !== "127.0.0.1") {
			throw new errs.ValidationError("Issuer URL must use HTTPS");
		}

		// Fetch discovery document directly — no credentials needed for .well-known
		const discoveryUrl = new URL("/.well-known/openid-configuration", issuerUrl);
		const response = await fetch(discoveryUrl.href);
		if (!response.ok) {
			throw new Error(`Discovery endpoint returned ${response.status}`);
		}
		const metadata = await response.json();

		return {
			issuer: metadata.issuer,
			authorization_endpoint: metadata.authorization_endpoint,
			token_endpoint: metadata.token_endpoint,
			userinfo_endpoint: metadata.userinfo_endpoint,
			scopes_supported: metadata.scopes_supported,
		};
	},
};

export default internalOidc;
