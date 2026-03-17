import fs from "node:fs";
import express from "express";
import internalImportExport from "../internal/import-export.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import { debug, express as logger } from "../logger.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * POST /api/import-export/export
 *
 * Export configuration as JSON
 */
router
	.route("/export")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.post(jwtdecode(), async (req, res, next) => {
		try {
			const options = {
				type: req.body.type || "full",
				include_types: req.body.include_types,
				host_ids: req.body.host_ids,
				include_certificates: false,
			};

			const { payload } = await internalImportExport.exportData(res.locals.access, options);

			const dateStr = new Date().toISOString().split("T")[0];
			res.setHeader("Content-Disposition", `attachment; filename="spm-export-${dateStr}.json"`);
			res.setHeader("Content-Type", "application/json");
			res.status(200).json(payload);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * POST /api/import-export/export/download
 *
 * Export configuration as ZIP (with certificate files)
 */
router
	.route("/export/download")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.post(jwtdecode(), async (req, res, next) => {
		try {
			const options = {
				type: req.body.type || "full",
				include_types: req.body.include_types,
				host_ids: req.body.host_ids,
				include_certificates: true,
			};

			const { payload, certFiles } = await internalImportExport.exportData(res.locals.access, options);

			const dateStr = new Date().toISOString().split("T")[0];
			const zipPath = `/tmp/spm-export-${dateStr}-${Date.now()}.zip`;

			await internalImportExport.createZipArchive(payload, certFiles, zipPath);

			res.setHeader("Content-Disposition", `attachment; filename="spm-export-${dateStr}.zip"`);
			res.setHeader("Content-Type", "application/zip");
			res.sendFile(zipPath, (err) => {
				// Clean up temp file
				try {
					fs.unlinkSync(zipPath);
				} catch (_cleanupErr) {
					// Ignore cleanup errors
				}
				if (err && !res.headersSent) {
					next(err);
				}
			});
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * POST /api/import-export/import/preview
 *
 * Preview an import (validate and check conflicts)
 */
router
	.route("/import/preview")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.post(jwtdecode(), async (req, res, next) => {
		try {
			let exportPayload;

			// Handle file upload (multipart) or JSON body
			if (req.files && req.files.file) {
				const file = req.files.file;
				const fileName = file.name.toLowerCase();

				if (fileName.endsWith(".json")) {
					exportPayload = JSON.parse(file.data.toString("utf8"));
				} else {
					throw new Error("Unsupported file format. Please upload a .json file. If you have a ZIP export, extract export.json from it first.");
				}
			} else if (req.body && req.body.spm_export) {
				// Direct JSON body
				exportPayload = req.body;
			} else if (req.body && req.body.payload) {
				// Wrapped in a payload field
				exportPayload = req.body.payload;
			} else {
				throw new Error("No import data provided. Upload a file or send JSON body.");
			}

			const preview = await internalImportExport.importPreview(res.locals.access, exportPayload);
			// Include the payload in the response so the client can use it for commit
			preview.payload = exportPayload;
			res.status(200).json(preview);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * POST /api/import-export/import/commit
 *
 * Commit an import with conflict resolutions
 */
router
	.route("/import/commit")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.post(jwtdecode(), async (req, res, next) => {
		try {
			const { payload, resolutions } = req.body;

			if (!payload || !payload.spm_export) {
				throw new Error("Missing import payload");
			}

			const result = await internalImportExport.importCommit(
				res.locals.access,
				payload,
				resolutions || { conflicts: [] },
			);

			res.status(201).json(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * POST /api/import-export/migrate/npm
 *
 * Upload an NPM SQLite database for migration
 */
router
	.route("/migrate/npm")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.post(jwtdecode(), async (req, res, next) => {
		try {
			if (!req.files || !req.files.database) {
				throw new Error("No database file uploaded. Please upload your NPM database.sqlite file.");
			}

			const dbFile = req.files.database;
			const tmpPath = `/tmp/npm-migration-${Date.now()}.sqlite`;

			// Write the uploaded file to a temp location
			await dbFile.mv(tmpPath);

			try {
				const exportPayload = await internalImportExport.migrateFromNpm(res.locals.access, tmpPath);

				// Run preview on the converted data
				const preview = await internalImportExport.importPreview(res.locals.access, exportPayload);
				preview.payload = exportPayload;

				res.status(200).json(preview);
			} finally {
				// Clean up temp file
				try {
					fs.unlinkSync(tmpPath);
				} catch (_cleanupErr) {
					// Ignore
				}
			}
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

export default router;
