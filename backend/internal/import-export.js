import fs from "node:fs";
import archiver from "archiver";
import _ from "lodash";
import errs from "../lib/error.js";
import accessListModel from "../models/access_list.js";
import accessListAuthModel from "../models/access_list_auth.js";
import accessListClientModel from "../models/access_list_client.js";
import certificateModel from "../models/certificate.js";
import deadHostModel from "../models/dead_host.js";
import proxyHostModel from "../models/proxy_host.js";
import redirectionHostModel from "../models/redirection_host.js";
import settingModel from "../models/setting.js";
import streamModel from "../models/stream.js";
import internalAuditLog from "./audit-log.js";
import internalCertificate from "./certificate.js";
import internalHost from "./host.js";
import internalNginx from "./nginx.js";

const EXPORT_VERSION = "1.0.0";
const SPM_VERSION = "1.0.0";
const NPM_BASE_VERSION = "2.14.0";

const SYSTEM_FIELDS = ["id", "created_on", "modified_on", "owner_user_id", "is_deleted"];

const ALL_TYPES = [
	"access_lists",
	"certificates",
	"proxy_hosts",
	"redirection_hosts",
	"dead_hosts",
	"streams",
	"settings",
];

/**
 * Strip system-managed fields from an object
 * @param {Object} obj
 * @returns {Object}
 */
const stripSystemFields = (obj) => {
	return _.omit(obj, SYSTEM_FIELDS);
};

const internalImportExport = {
	/**
	 * Export data from this SPM instance
	 *
	 * @param   {Access}  access
	 * @param   {Object}  options
	 * @param   {String}  options.type              "full" or "selective"
	 * @param   {Array}   [options.host_ids]        Array of proxy host IDs (selective only)
	 * @param   {Array}   [options.include_types]   Array of type strings to include
	 * @param   {Boolean} [options.include_certificates]  Whether to include PEM files
	 * @returns {Promise<Object>}  { payload, certFiles? }
	 */
	exportData: async (access, options) => {
		await access.can("import_export:manage");

		const includeTypes = options.include_types || ALL_TYPES;
		const includeCerts = options.include_certificates || false;

		const payload = {
			spm_export: {
				version: EXPORT_VERSION,
				spm_version: SPM_VERSION,
				npm_base_version: NPM_BASE_VERSION,
				exported_at: new Date().toISOString(),
				export_type: options.type || "full",
				includes_certificates: includeCerts,
			},
			access_lists: [],
			certificates: [],
			proxy_hosts: [],
			redirection_hosts: [],
			dead_hosts: [],
			streams: [],
			settings: [],
		};

		// Build _export_id mappings
		const certIdToExportId = {};
		const accessListIdToExportId = {};
		let certExportId = 1;
		let accessListExportId = 1;

		// Collect cert file paths for ZIP
		const certFiles = [];

		// ---- Access Lists ----
		if (includeTypes.includes("access_lists")) {
			const accessLists = await accessListModel
				.query()
				.where("is_deleted", 0)
				.withGraphFetched("[items, clients]");

			for (const al of accessLists) {
				const exportId = accessListExportId++;
				accessListIdToExportId[al.id] = exportId;

				const exported = {
					_export_id: exportId,
					name: al.name,
					satisfy_any: al.satisfy_any,
					pass_auth: al.pass_auth,
					meta: al.meta || {},
					items: (al.items || []).map((item) => ({
						username: item.username,
						password: item.password,
						meta: item.meta || {},
					})),
					clients: (al.clients || []).map((client) => ({
						address: client.address,
						directive: client.directive,
						meta: client.meta || {},
					})),
				};

				payload.access_lists.push(exported);
			}
		}

		// ---- Certificates ----
		if (includeTypes.includes("certificates")) {
			const certificates = await certificateModel
				.query()
				.where("is_deleted", 0);

			for (const cert of certificates) {
				const exportId = certExportId++;
				certIdToExportId[cert.id] = exportId;

				const exported = {
					_export_id: exportId,
					provider: cert.provider,
					nice_name: cert.nice_name,
					domain_names: cert.domain_names,
					expires_on: cert.expires_on,
					meta: includeCerts ? (cert.meta || {}) : internalCertificate.cleanMeta(_.cloneDeep(cert.meta || {})),
				};

				payload.certificates.push(exported);

				// Collect cert file paths for ZIP
				if (includeCerts) {
					if (cert.provider === "letsencrypt") {
						const lePath = internalCertificate.getLiveCertPath(cert.id);
						if (fs.existsSync(`${lePath}/fullchain.pem`)) {
							certFiles.push({
								filePath: `${lePath}/fullchain.pem`,
								archivePath: `certificates/npm-${cert.id}/fullchain.pem`,
							});
						}
						if (fs.existsSync(`${lePath}/privkey.pem`)) {
							certFiles.push({
								filePath: `${lePath}/privkey.pem`,
								archivePath: `certificates/npm-${cert.id}/privkey.pem`,
							});
						}
					} else if (cert.provider === "other") {
						const customPath = `/data/custom_ssl/npm-${cert.id}`;
						if (fs.existsSync(`${customPath}/fullchain.pem`)) {
							certFiles.push({
								filePath: `${customPath}/fullchain.pem`,
								archivePath: `certificates/npm-${cert.id}/fullchain.pem`,
							});
						}
						if (fs.existsSync(`${customPath}/privkey.pem`)) {
							certFiles.push({
								filePath: `${customPath}/privkey.pem`,
								archivePath: `certificates/npm-${cert.id}/privkey.pem`,
							});
						}
					}
				}
			}
		}

		// Helper to replace certificate_id and access_list_id with refs
		const replaceRefs = (row) => {
			const obj = stripSystemFields(row);

			if (typeof obj.certificate_id !== "undefined") {
				obj.certificate_ref = certIdToExportId[obj.certificate_id] || null;
				delete obj.certificate_id;
			}

			if (typeof obj.access_list_id !== "undefined") {
				obj.access_list_ref = accessListIdToExportId[obj.access_list_id] || null;
				delete obj.access_list_id;
			}

			// Remove expanded relations
			delete obj.certificate;
			delete obj.access_list;
			delete obj.owner;

			return obj;
		};

		// ---- Proxy Hosts ----
		if (includeTypes.includes("proxy_hosts")) {
			let query = proxyHostModel.query().where("is_deleted", 0);

			if (options.type === "selective" && options.host_ids && options.host_ids.length > 0) {
				query = query.whereIn("id", options.host_ids);
			}

			const proxyHosts = await query;

			for (const host of proxyHosts) {
				// Ensure we also map certificates/access lists that may not have been
				// explicitly included but are referenced by selective hosts
				const exported = replaceRefs(host);
				exported.meta = exported.meta || {};
				payload.proxy_hosts.push(exported);
			}
		}

		// ---- Redirection Hosts ----
		if (includeTypes.includes("redirection_hosts")) {
			const redirectionHosts = await redirectionHostModel
				.query()
				.where("is_deleted", 0);

			for (const host of redirectionHosts) {
				const exported = replaceRefs(host);
				exported.meta = exported.meta || {};
				payload.redirection_hosts.push(exported);
			}
		}

		// ---- Dead Hosts ----
		if (includeTypes.includes("dead_hosts")) {
			const deadHosts = await deadHostModel
				.query()
				.where("is_deleted", 0);

			for (const host of deadHosts) {
				const exported = replaceRefs(host);
				exported.meta = exported.meta || {};
				payload.dead_hosts.push(exported);
			}
		}

		// ---- Streams ----
		if (includeTypes.includes("streams")) {
			const streams = await streamModel
				.query()
				.where("is_deleted", 0);

			for (const stream of streams) {
				const exported = replaceRefs(stream);
				exported.meta = exported.meta || {};
				payload.streams.push(exported);
			}
		}

		// ---- Settings ----
		if (includeTypes.includes("settings")) {
			const settings = await settingModel.query();

			for (const setting of settings) {
				payload.settings.push({
					id: setting.id,
					name: setting.name,
					description: setting.description,
					value: setting.value,
					meta: setting.meta || {},
				});
			}
		}

		return { payload, certFiles };
	},

	/**
	 * Create a ZIP archive containing the export JSON and optionally cert files
	 *
	 * @param   {Object}  payload    The export payload
	 * @param   {Array}   certFiles  Array of { filePath, archivePath }
	 * @param   {String}  outputPath Path for the ZIP file
	 * @returns {Promise}
	 */
	createZipArchive: async (payload, certFiles, outputPath) => {
		const archive = archiver("zip", { zlib: { level: 9 } });
		const stream = fs.createWriteStream(outputPath);

		return new Promise((resolve, reject) => {
			archive.on("error", (err) => reject(err));
			stream.on("close", () => resolve());

			archive.pipe(stream);

			// Add export.json
			archive.append(JSON.stringify(payload, null, 2), { name: "export.json" });

			// Add certificate files
			for (const cert of certFiles) {
				if (fs.existsSync(cert.filePath)) {
					archive.file(cert.filePath, { name: cert.archivePath });
				}
			}

			archive.finalize();
		});
	},

	/**
	 * Preview an import by validating the payload and checking for conflicts
	 *
	 * @param   {Access}  access
	 * @param   {Object}  exportPayload
	 * @returns {Promise<Object>}
	 */
	importPreview: async (access, exportPayload) => {
		await access.can("import_export:manage");

		// Validate basic structure
		if (!exportPayload || !exportPayload.spm_export) {
			throw new errs.ValidationError("Invalid export file: missing spm_export header");
		}

		if (!exportPayload.spm_export.version) {
			throw new errs.ValidationError("Invalid export file: missing version");
		}

		const result = {
			valid: true,
			export_info: exportPayload.spm_export,
			summary: {
				access_lists: { total: 0, new: 0, conflict: 0 },
				certificates: { total: 0, new: 0, conflict: 0 },
				proxy_hosts: { total: 0, new: 0, conflict: 0 },
				redirection_hosts: { total: 0, new: 0, conflict: 0 },
				dead_hosts: { total: 0, new: 0, conflict: 0 },
				streams: { total: 0, new: 0, conflict: 0 },
				settings: { total: 0, new: 0, conflict: 0 },
			},
			conflicts: [],
		};

		// Check access list conflicts (by name)
		if (exportPayload.access_lists && exportPayload.access_lists.length > 0) {
			const existingAccessLists = await accessListModel.query().where("is_deleted", 0);
			const existingNames = existingAccessLists.map((al) => al.name.toLowerCase());

			for (let i = 0; i < exportPayload.access_lists.length; i++) {
				const al = exportPayload.access_lists[i];
				result.summary.access_lists.total++;

				const existingMatch = existingAccessLists.find(
					(existing) => existing.name.toLowerCase() === al.name.toLowerCase(),
				);

				if (existingMatch) {
					result.summary.access_lists.conflict++;
					result.conflicts.push({
						type: "access_list",
						name: al.name,
						existing_id: existingMatch.id,
						import_index: i,
					});
				} else {
					result.summary.access_lists.new++;
				}
			}
		}

		// Check certificate conflicts (by domain_names + provider)
		if (exportPayload.certificates && exportPayload.certificates.length > 0) {
			const existingCerts = await certificateModel.query().where("is_deleted", 0);

			for (let i = 0; i < exportPayload.certificates.length; i++) {
				const cert = exportPayload.certificates[i];
				result.summary.certificates.total++;

				const existingMatch = existingCerts.find(
					(existing) =>
						existing.provider === cert.provider &&
						_.isEqual(
							(existing.domain_names || []).sort(),
							(cert.domain_names || []).sort(),
						),
				);

				if (existingMatch) {
					result.summary.certificates.conflict++;
					result.conflicts.push({
						type: "certificate",
						domain_names: cert.domain_names,
						provider: cert.provider,
						existing_id: existingMatch.id,
						import_index: i,
					});
				} else {
					result.summary.certificates.new++;
				}
			}
		}

		// Check host conflicts (domain names)
		const hostTypes = [
			{ key: "proxy_hosts", type: "proxy_host" },
			{ key: "redirection_hosts", type: "redirection_host" },
			{ key: "dead_hosts", type: "dead_host" },
		];

		for (const hostType of hostTypes) {
			const hosts = exportPayload[hostType.key];
			if (hosts && hosts.length > 0) {
				for (let i = 0; i < hosts.length; i++) {
					const host = hosts[i];
					result.summary[hostType.key].total++;

					if (host.domain_names && host.domain_names.length > 0) {
						let hasConflict = false;
						const conflictDomains = [];

						for (const domain of host.domain_names) {
							const taken = await internalHost.isHostnameTaken(domain);
							if (taken.is_taken) {
								hasConflict = true;
								conflictDomains.push(domain);
							}
						}

						if (hasConflict) {
							result.summary[hostType.key].conflict++;
							result.conflicts.push({
								type: hostType.type,
								domain_names: host.domain_names,
								conflicting_domains: conflictDomains,
								import_index: i,
							});
						} else {
							result.summary[hostType.key].new++;
						}
					} else {
						result.summary[hostType.key].new++;
					}
				}
			}
		}

		// Check stream conflicts (incoming_port)
		if (exportPayload.streams && exportPayload.streams.length > 0) {
			const existingStreams = await streamModel.query().where("is_deleted", 0);

			for (let i = 0; i < exportPayload.streams.length; i++) {
				const stream = exportPayload.streams[i];
				result.summary.streams.total++;

				const existingMatch = existingStreams.find(
					(existing) => existing.incoming_port === stream.incoming_port,
				);

				if (existingMatch) {
					result.summary.streams.conflict++;
					result.conflicts.push({
						type: "stream",
						incoming_port: stream.incoming_port,
						existing_id: existingMatch.id,
						import_index: i,
					});
				} else {
					result.summary.streams.new++;
				}
			}
		}

		// Settings
		if (exportPayload.settings && exportPayload.settings.length > 0) {
			result.summary.settings.total = exportPayload.settings.length;
			result.summary.settings.new = exportPayload.settings.length;
		}

		return result;
	},

	/**
	 * Commit an import with conflict resolutions
	 *
	 * @param   {Access}  access
	 * @param   {Object}  exportPayload
	 * @param   {Object}  resolutions   { conflicts: [{ type, import_index, action }] }
	 * @returns {Promise<Object>}
	 */
	importCommit: async (access, exportPayload, resolutions) => {
		await access.can("import_export:manage");

		const userId = access.token.getUserId(1);
		const resolutionMap = {};

		// Build a lookup for resolutions
		if (resolutions && resolutions.conflicts) {
			for (const r of resolutions.conflicts) {
				const key = `${r.type}:${r.import_index}`;
				resolutionMap[key] = r.action;
			}
		}

		const getResolution = (type, index) => {
			return resolutionMap[`${type}:${index}`] || "skip";
		};

		const importResult = {
			access_lists: { created: 0, skipped: 0, overwritten: 0 },
			certificates: { created: 0, skipped: 0, used_existing: 0 },
			proxy_hosts: { created: 0, skipped: 0, overwritten: 0 },
			redirection_hosts: { created: 0, skipped: 0, overwritten: 0 },
			dead_hosts: { created: 0, skipped: 0, overwritten: 0 },
			streams: { created: 0, skipped: 0, overwritten: 0 },
			settings: { updated: 0, skipped: 0 },
		};

		// ID mappings: export_id -> new db id
		const accessListIdMap = {};
		const certIdMap = {};

		// ---- 1. Import Access Lists ----
		if (exportPayload.access_lists && exportPayload.access_lists.length > 0) {
			const existingAccessLists = await accessListModel.query().where("is_deleted", 0);

			for (let i = 0; i < exportPayload.access_lists.length; i++) {
				const al = exportPayload.access_lists[i];
				const existingMatch = existingAccessLists.find(
					(existing) => existing.name.toLowerCase() === al.name.toLowerCase(),
				);

				if (existingMatch) {
					const resolution = getResolution("access_list", i);
					if (resolution === "skip") {
						// Map to existing for reference resolution
						accessListIdMap[al._export_id] = existingMatch.id;
						importResult.access_lists.skipped++;
						continue;
					}
					if (resolution === "overwrite") {
						// Delete existing items and clients
						await accessListAuthModel.query().delete().where("access_list_id", existingMatch.id);
						await accessListClientModel.query().delete().where("access_list_id", existingMatch.id);

						// Update the access list
						await accessListModel.query().where("id", existingMatch.id).patch({
							name: al.name,
							satisfy_any: al.satisfy_any || false,
							pass_auth: al.pass_auth || false,
						});

						// Insert items and clients
						if (al.items) {
							for (const item of al.items) {
								await accessListAuthModel.query().insert({
									access_list_id: existingMatch.id,
									username: item.username,
									password: item.password,
								});
							}
						}
						if (al.clients) {
							for (const client of al.clients) {
								await accessListClientModel.query().insert({
									access_list_id: existingMatch.id,
									address: client.address,
									directive: client.directive,
								});
							}
						}

						accessListIdMap[al._export_id] = existingMatch.id;
						importResult.access_lists.overwritten++;
						continue;
					}
				}

				// Create new access list
				const newAl = await accessListModel.query().insertAndFetch({
					name: al.name,
					satisfy_any: al.satisfy_any || false,
					pass_auth: al.pass_auth || false,
					owner_user_id: userId,
				});

				if (al.items) {
					for (const item of al.items) {
						await accessListAuthModel.query().insert({
							access_list_id: newAl.id,
							username: item.username,
							password: item.password,
						});
					}
				}

				if (al.clients) {
					for (const client of al.clients) {
						await accessListClientModel.query().insert({
							access_list_id: newAl.id,
							address: client.address,
							directive: client.directive,
						});
					}
				}

				accessListIdMap[al._export_id] = newAl.id;
				importResult.access_lists.created++;

				// Audit log
				await internalAuditLog.add(access, {
					action: "created",
					object_type: "access-list",
					object_id: newAl.id,
					meta: { name: al.name, imported: true },
				});
			}
		}

		// ---- 2. Import Certificates ----
		if (exportPayload.certificates && exportPayload.certificates.length > 0) {
			const existingCerts = await certificateModel.query().where("is_deleted", 0);

			for (let i = 0; i < exportPayload.certificates.length; i++) {
				const cert = exportPayload.certificates[i];
				const existingMatch = existingCerts.find(
					(existing) =>
						existing.provider === cert.provider &&
						_.isEqual(
							(existing.domain_names || []).sort(),
							(cert.domain_names || []).sort(),
						),
				);

				if (existingMatch) {
					const resolution = getResolution("certificate", i);
					if (resolution === "skip" || resolution === "use_existing") {
						certIdMap[cert._export_id] = existingMatch.id;
						importResult.certificates.used_existing++;
						continue;
					}
				}

				// Create new certificate row
				const certData = {
					provider: cert.provider,
					nice_name: cert.nice_name,
					domain_names: cert.domain_names,
					expires_on: cert.expires_on || "1970-01-01 00:00:00",
					owner_user_id: userId,
					meta: cert.meta || {},
				};

				const newCert = await certificateModel.query().insertAndFetch(certData);
				certIdMap[cert._export_id] = newCert.id;

				// Write custom cert files if PEM data is in meta
				if (cert.provider === "other" && cert.meta) {
					if (cert.meta.certificate || cert.meta.certificate_key) {
						try {
							await internalCertificate.writeCustomCert({
								id: newCert.id,
								provider: "other",
								meta: cert.meta,
							});
						} catch (_err) {
							// Non-fatal: cert files might not be available
						}
					}
				}

				importResult.certificates.created++;

				// Audit log
				await internalAuditLog.add(access, {
					action: "created",
					object_type: "certificate",
					object_id: newCert.id,
					meta: { nice_name: cert.nice_name, imported: true },
				});
			}
		}

		// Helper to resolve refs to actual DB IDs
		const resolveRefs = (hostData) => {
			const data = { ...hostData };

			if (typeof data.certificate_ref !== "undefined") {
				data.certificate_id = data.certificate_ref ? (certIdMap[data.certificate_ref] || 0) : 0;
				delete data.certificate_ref;
			} else {
				data.certificate_id = 0;
			}

			if (typeof data.access_list_ref !== "undefined") {
				data.access_list_id = data.access_list_ref ? (accessListIdMap[data.access_list_ref] || 0) : 0;
				delete data.access_list_ref;
			} else if (typeof data.access_list_id === "undefined") {
				data.access_list_id = 0;
			}

			data.owner_user_id = userId;

			// Remove _export_id if present
			delete data._export_id;

			return data;
		};

		// ---- 3. Import Proxy Hosts ----
		if (exportPayload.proxy_hosts && exportPayload.proxy_hosts.length > 0) {
			for (let i = 0; i < exportPayload.proxy_hosts.length; i++) {
				const host = exportPayload.proxy_hosts[i];

				// Check for conflict
				let hasConflict = false;
				if (host.domain_names && host.domain_names.length > 0) {
					for (const domain of host.domain_names) {
						const taken = await internalHost.isHostnameTaken(domain);
						if (taken.is_taken) {
							hasConflict = true;
							break;
						}
					}
				}

				if (hasConflict) {
					const resolution = getResolution("proxy_host", i);
					if (resolution === "skip") {
						importResult.proxy_hosts.skipped++;
						continue;
					}
					if (resolution === "overwrite") {
						// Find and soft-delete existing hosts with these domains
						for (const domain of host.domain_names) {
							const existing = await proxyHostModel
								.query()
								.where("is_deleted", 0)
								.whereRaw("domain_names LIKE ?", [`%${domain}%`]);

							for (const row of existing) {
								await proxyHostModel.query().where("id", row.id).patch({ is_deleted: 1 });
								await internalNginx.deleteConfig("proxy_host", row);
							}
						}
						importResult.proxy_hosts.overwritten++;
					}
				}

				const data = resolveRefs(host);
				data.meta = data.meta || {};

				if (typeof data.advanced_config === "undefined") {
					data.advanced_config = "";
				}

				const cleanedData = internalHost.cleanSslHstsData(data);
				const newHost = await proxyHostModel.query().insertAndFetch(cleanedData);

				// Configure nginx
				try {
					const fullRow = await proxyHostModel
						.query()
						.where("id", newHost.id)
						.withGraphFetched("[certificate, access_list.[clients,items]]")
						.first();

					if (fullRow && fullRow.enabled) {
						await internalNginx.configure(proxyHostModel, "proxy_host", fullRow);
					}
				} catch (_err) {
					// Non-fatal: nginx config might fail but the DB record is created
				}

				if (!hasConflict) {
					importResult.proxy_hosts.created++;
				}

				// Audit log
				await internalAuditLog.add(access, {
					action: "created",
					object_type: "proxy-host",
					object_id: newHost.id,
					meta: { domain_names: host.domain_names, imported: true },
				});
			}
		}

		// ---- 4. Import Redirection Hosts ----
		if (exportPayload.redirection_hosts && exportPayload.redirection_hosts.length > 0) {
			for (let i = 0; i < exportPayload.redirection_hosts.length; i++) {
				const host = exportPayload.redirection_hosts[i];

				let hasConflict = false;
				if (host.domain_names && host.domain_names.length > 0) {
					for (const domain of host.domain_names) {
						const taken = await internalHost.isHostnameTaken(domain);
						if (taken.is_taken) {
							hasConflict = true;
							break;
						}
					}
				}

				if (hasConflict) {
					const resolution = getResolution("redirection_host", i);
					if (resolution === "skip") {
						importResult.redirection_hosts.skipped++;
						continue;
					}
					if (resolution === "overwrite") {
						for (const domain of host.domain_names) {
							const existing = await redirectionHostModel
								.query()
								.where("is_deleted", 0)
								.whereRaw("domain_names LIKE ?", [`%${domain}%`]);

							for (const row of existing) {
								await redirectionHostModel.query().where("id", row.id).patch({ is_deleted: 1 });
								await internalNginx.deleteConfig("redirection_host", row);
							}
						}
						importResult.redirection_hosts.overwritten++;
					}
				}

				const data = resolveRefs(host);
				data.meta = data.meta || {};

				if (typeof data.advanced_config === "undefined") {
					data.advanced_config = "";
				}

				const cleanedData = internalHost.cleanSslHstsData(data);
				const newHost = await redirectionHostModel.query().insertAndFetch(cleanedData);

				try {
					const fullRow = await redirectionHostModel
						.query()
						.where("id", newHost.id)
						.withGraphFetched("[certificate]")
						.first();

					if (fullRow && fullRow.enabled) {
						await internalNginx.configure(redirectionHostModel, "redirection_host", fullRow);
					}
				} catch (_err) {
					// Non-fatal
				}

				if (!hasConflict) {
					importResult.redirection_hosts.created++;
				}

				await internalAuditLog.add(access, {
					action: "created",
					object_type: "redirection-host",
					object_id: newHost.id,
					meta: { domain_names: host.domain_names, imported: true },
				});
			}
		}

		// ---- 5. Import Dead Hosts ----
		if (exportPayload.dead_hosts && exportPayload.dead_hosts.length > 0) {
			for (let i = 0; i < exportPayload.dead_hosts.length; i++) {
				const host = exportPayload.dead_hosts[i];

				let hasConflict = false;
				if (host.domain_names && host.domain_names.length > 0) {
					for (const domain of host.domain_names) {
						const taken = await internalHost.isHostnameTaken(domain);
						if (taken.is_taken) {
							hasConflict = true;
							break;
						}
					}
				}

				if (hasConflict) {
					const resolution = getResolution("dead_host", i);
					if (resolution === "skip") {
						importResult.dead_hosts.skipped++;
						continue;
					}
					if (resolution === "overwrite") {
						for (const domain of host.domain_names) {
							const existing = await deadHostModel
								.query()
								.where("is_deleted", 0)
								.whereRaw("domain_names LIKE ?", [`%${domain}%`]);

							for (const row of existing) {
								await deadHostModel.query().where("id", row.id).patch({ is_deleted: 1 });
								await internalNginx.deleteConfig("dead_host", row);
							}
						}
						importResult.dead_hosts.overwritten++;
					}
				}

				const data = resolveRefs(host);
				data.meta = data.meta || {};

				if (typeof data.advanced_config === "undefined") {
					data.advanced_config = "";
				}

				const cleanedData = internalHost.cleanSslHstsData(data);
				const newHost = await deadHostModel.query().insertAndFetch(cleanedData);

				try {
					const fullRow = await deadHostModel
						.query()
						.where("id", newHost.id)
						.withGraphFetched("[certificate]")
						.first();

					if (fullRow && fullRow.enabled) {
						await internalNginx.configure(deadHostModel, "dead_host", fullRow);
					}
				} catch (_err) {
					// Non-fatal
				}

				if (!hasConflict) {
					importResult.dead_hosts.created++;
				}

				await internalAuditLog.add(access, {
					action: "created",
					object_type: "dead-host",
					object_id: newHost.id,
					meta: { domain_names: host.domain_names, imported: true },
				});
			}
		}

		// ---- 6. Import Streams ----
		if (exportPayload.streams && exportPayload.streams.length > 0) {
			const existingStreams = await streamModel.query().where("is_deleted", 0);

			for (let i = 0; i < exportPayload.streams.length; i++) {
				const stream = exportPayload.streams[i];
				const existingMatch = existingStreams.find(
					(existing) => existing.incoming_port === stream.incoming_port,
				);

				if (existingMatch) {
					const resolution = getResolution("stream", i);
					if (resolution === "skip") {
						importResult.streams.skipped++;
						continue;
					}
					if (resolution === "overwrite") {
						await streamModel.query().where("id", existingMatch.id).patch({ is_deleted: 1 });
						await internalNginx.deleteConfig("stream", existingMatch);
						importResult.streams.overwritten++;
					}
				}

				const data = resolveRefs(stream);
				data.meta = data.meta || {};

				const newStream = await streamModel.query().insertAndFetch(data);

				try {
					const fullRow = await streamModel
						.query()
						.where("id", newStream.id)
						.first();

					if (fullRow && fullRow.enabled) {
						await internalNginx.configure(streamModel, "stream", fullRow);
					}
				} catch (_err) {
					// Non-fatal
				}

				if (!existingMatch) {
					importResult.streams.created++;
				}

				await internalAuditLog.add(access, {
					action: "created",
					object_type: "stream",
					object_id: newStream.id,
					meta: { incoming_port: stream.incoming_port, imported: true },
				});
			}
		}

		// ---- 7. Import Settings ----
		if (exportPayload.settings && exportPayload.settings.length > 0) {
			for (const setting of exportPayload.settings) {
				const resolution = getResolution("setting", exportPayload.settings.indexOf(setting));
				if (resolution === "skip") {
					importResult.settings.skipped++;
					continue;
				}

				try {
					const existing = await settingModel.query().where("id", setting.id).first();
					if (existing) {
						await settingModel.query().where("id", setting.id).patch({
							value: setting.value,
							meta: setting.meta || {},
						});
						importResult.settings.updated++;
					} else {
						importResult.settings.skipped++;
					}
				} catch (_err) {
					importResult.settings.skipped++;
				}
			}
		}

		// Reload NGINX once at the end
		try {
			await internalNginx.reload();
		} catch (_err) {
			// Non-fatal
		}

		return importResult;
	},

	/**
	 * Migrate from NPM by reading its SQLite database file
	 *
	 * @param   {Access}  access
	 * @param   {String}  sqliteDbPath  Path to the uploaded SQLite file on disk
	 * @returns {Promise<Object>}  Export-format payload
	 */
	migrateFromNpm: async (access, sqliteDbPath) => {
		await access.can("import_export:manage");

		// Dynamic import of better-sqlite3
		const Database = (await import("better-sqlite3")).default;

		let db;
		try {
			db = new Database(sqliteDbPath, { readonly: true });
		} catch (err) {
			throw new errs.ValidationError(`Failed to open SQLite database: ${err.message}`);
		}

		const payload = {
			spm_export: {
				version: EXPORT_VERSION,
				spm_version: SPM_VERSION,
				npm_base_version: NPM_BASE_VERSION,
				exported_at: new Date().toISOString(),
				export_type: "npm_migration",
				includes_certificates: false,
			},
			access_lists: [],
			certificates: [],
			proxy_hosts: [],
			redirection_hosts: [],
			dead_hosts: [],
			streams: [],
			settings: [],
		};

		const certIdToExportId = {};
		const accessListIdToExportId = {};
		let certExportId = 1;
		let accessListExportId = 1;

		try {
			// ---- Access Lists ----
			const accessLists = db.prepare("SELECT * FROM access_list WHERE is_deleted = 0").all();
			for (const al of accessLists) {
				const exportId = accessListExportId++;
				accessListIdToExportId[al.id] = exportId;

				const items = db.prepare("SELECT * FROM access_list_auth WHERE access_list_id = ?").all(al.id);
				const clients = db.prepare("SELECT * FROM access_list_client WHERE access_list_id = ?").all(al.id);

				payload.access_lists.push({
					_export_id: exportId,
					name: al.name,
					satisfy_any: Boolean(al.satisfy_any),
					pass_auth: Boolean(al.pass_auth),
					meta: internalImportExport._parseJsonField(al.meta),
					items: items.map((item) => ({
						username: item.username,
						password: item.password,
						meta: internalImportExport._parseJsonField(item.meta),
					})),
					clients: clients.map((client) => ({
						address: client.address,
						directive: client.directive,
						meta: internalImportExport._parseJsonField(client.meta),
					})),
				});
			}

			// ---- Certificates ----
			const certificates = db.prepare("SELECT * FROM certificate WHERE is_deleted = 0").all();
			for (const cert of certificates) {
				const exportId = certExportId++;
				certIdToExportId[cert.id] = exportId;

				const meta = internalImportExport._parseJsonField(cert.meta);

				payload.certificates.push({
					_export_id: exportId,
					provider: cert.provider,
					nice_name: cert.nice_name,
					domain_names: internalImportExport._parseJsonField(cert.domain_names),
					expires_on: cert.expires_on,
					meta: internalCertificate.cleanMeta(_.cloneDeep(meta)),
				});
			}

			// Helper for host rows
			const convertHost = (row) => {
				const domainNames = internalImportExport._parseJsonField(row.domain_names);
				const meta = internalImportExport._parseJsonField(row.meta);
				const locations = internalImportExport._parseJsonField(row.locations);

				const obj = {
					domain_names: domainNames,
					certificate_ref: certIdToExportId[row.certificate_id] || null,
					ssl_forced: Boolean(row.ssl_forced),
					http2_support: Boolean(row.http2_support),
					hsts_enabled: Boolean(row.hsts_enabled),
					hsts_subdomains: Boolean(row.hsts_subdomains),
					enabled: Boolean(row.enabled),
					advanced_config: row.advanced_config || "",
					meta: meta,
				};

				// Proxy-host specific fields
				if (typeof row.forward_scheme !== "undefined") {
					obj.forward_scheme = row.forward_scheme;
				}
				if (typeof row.forward_host !== "undefined") {
					obj.forward_host = row.forward_host;
				}
				if (typeof row.forward_port !== "undefined") {
					obj.forward_port = row.forward_port;
				}
				if (typeof row.caching_enabled !== "undefined") {
					obj.caching_enabled = Boolean(row.caching_enabled);
				}
				if (typeof row.block_exploits !== "undefined") {
					obj.block_exploits = Boolean(row.block_exploits);
				}
				if (typeof row.allow_websocket_upgrade !== "undefined") {
					obj.allow_websocket_upgrade = Boolean(row.allow_websocket_upgrade);
				}
				if (typeof row.trust_forwarded_proto !== "undefined") {
					obj.trust_forwarded_proto = Boolean(row.trust_forwarded_proto);
				}
				if (typeof row.access_list_id !== "undefined" && row.access_list_id) {
					obj.access_list_ref = accessListIdToExportId[row.access_list_id] || null;
				}
				if (locations && Array.isArray(locations) && locations.length > 0) {
					obj.locations = locations;
				}

				// Redirection host specific
				if (typeof row.forward_domain_name !== "undefined") {
					obj.forward_domain_name = row.forward_domain_name;
				}
				if (typeof row.forward_http_code !== "undefined") {
					obj.forward_http_code = row.forward_http_code;
				}
				if (typeof row.preserve_path !== "undefined") {
					obj.preserve_path = Boolean(row.preserve_path);
				}

				return obj;
			};

			// ---- Proxy Hosts ----
			const proxyHosts = db.prepare("SELECT * FROM proxy_host WHERE is_deleted = 0").all();
			for (const host of proxyHosts) {
				payload.proxy_hosts.push(convertHost(host));
			}

			// ---- Redirection Hosts ----
			const redirectionHosts = db.prepare("SELECT * FROM redirection_host WHERE is_deleted = 0").all();
			for (const host of redirectionHosts) {
				payload.redirection_hosts.push(convertHost(host));
			}

			// ---- Dead Hosts ----
			const deadHosts = db.prepare("SELECT * FROM dead_host WHERE is_deleted = 0").all();
			for (const host of deadHosts) {
				payload.dead_hosts.push(convertHost(host));
			}

			// ---- Streams ----
			const streams = db.prepare("SELECT * FROM stream WHERE is_deleted = 0").all();
			for (const stream of streams) {
				const obj = {
					incoming_port: stream.incoming_port,
					forwarding_host: stream.forwarding_host,
					forwarding_port: stream.forwarding_port,
					tcp_forwarding: Boolean(stream.tcp_forwarding),
					udp_forwarding: Boolean(stream.udp_forwarding),
					certificate_ref: certIdToExportId[stream.certificate_id] || null,
					enabled: Boolean(stream.enabled),
					meta: internalImportExport._parseJsonField(stream.meta),
				};
				payload.streams.push(obj);
			}

			// ---- Settings ----
			const settings = db.prepare("SELECT * FROM setting").all();
			for (const setting of settings) {
				payload.settings.push({
					id: setting.id,
					name: setting.name,
					description: setting.description,
					value: setting.value,
					meta: internalImportExport._parseJsonField(setting.meta),
				});
			}
		} finally {
			if (db) {
				db.close();
			}
		}

		return payload;
	},

	/**
	 * Parse a JSON field from SQLite (may be a string or already parsed)
	 *
	 * @param   {*}  value
	 * @returns {*}
	 */
	_parseJsonField: (value) => {
		if (typeof value === "string") {
			try {
				return JSON.parse(value);
			} catch (_err) {
				return value;
			}
		}
		return value || {};
	},
};

export default internalImportExport;
