import express from "express";
import internalAuditLog from "../internal/audit-log.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import validator from "../lib/validator/index.js";
import { debug, express as logger } from "../logger.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * /api/audit-log
 */
router
	.route("/")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/audit-log
	 *
	 * Retrieve all logs with pagination and filtering
	 */
	.get(async (req, res, next) => {
		try {
			const data = await validator(
				{
					additionalProperties: false,
					properties: {
						expand: {
							$ref: "common#/properties/expand",
						},
						query: {
							$ref: "common#/properties/query",
						},
						page: {
							$ref: "common#/properties/page",
						},
						limit: {
							$ref: "common#/properties/limit",
						},
						date_from: {
							$ref: "common#/properties/date_from",
						},
						date_to: {
							$ref: "common#/properties/date_to",
						},
						user_id: {
							anyOf: [
								{ type: "null" },
								{ type: "integer", minimum: 1 },
							],
						},
						action: {
							anyOf: [
								{ type: "null" },
								{ type: "string", minLength: 1 },
							],
						},
						object_type: {
							anyOf: [
								{ type: "null" },
								{ type: "string", minLength: 1 },
							],
						},
					},
				},
				{
					expand: typeof req.query.expand === "string" ? req.query.expand.split(",") : null,
					query: typeof req.query.query === "string" ? req.query.query : null,
					page: typeof req.query.page !== "undefined" ? Number.parseInt(req.query.page, 10) : 1,
					limit: typeof req.query.limit !== "undefined" ? Number.parseInt(req.query.limit, 10) : 50,
					date_from: typeof req.query.date_from === "string" ? req.query.date_from : null,
					date_to: typeof req.query.date_to === "string" ? req.query.date_to : null,
					user_id: typeof req.query.user_id !== "undefined" ? Number.parseInt(req.query.user_id, 10) : null,
					action: typeof req.query.action === "string" ? req.query.action : null,
					object_type: typeof req.query.object_type === "string" ? req.query.object_type : null,
				},
			);
			const result = await internalAuditLog.getAll(res.locals.access, data.expand, data.query, {
				page: data.page,
				limit: data.limit,
				date_from: data.date_from,
				date_to: data.date_to,
				user_id: data.user_id,
				action: data.action,
				object_type: data.object_type,
			});
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * /api/audit-log/export
 */
router
	.route("/export")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/audit-log/export
	 *
	 * Export audit logs as CSV or JSON
	 */
	.get(async (req, res, next) => {
		try {
			const data = await validator(
				{
					additionalProperties: false,
					properties: {
						format: {
							type: "string",
							enum: ["csv", "json"],
							default: "json",
						},
						query: {
							$ref: "common#/properties/query",
						},
						date_from: {
							$ref: "common#/properties/date_from",
						},
						date_to: {
							$ref: "common#/properties/date_to",
						},
						user_id: {
							anyOf: [
								{ type: "null" },
								{ type: "integer", minimum: 1 },
							],
						},
						action: {
							anyOf: [
								{ type: "null" },
								{ type: "string", minLength: 1 },
							],
						},
						object_type: {
							anyOf: [
								{ type: "null" },
								{ type: "string", minLength: 1 },
							],
						},
					},
				},
				{
					format: typeof req.query.format === "string" ? req.query.format : "json",
					query: typeof req.query.query === "string" ? req.query.query : null,
					date_from: typeof req.query.date_from === "string" ? req.query.date_from : null,
					date_to: typeof req.query.date_to === "string" ? req.query.date_to : null,
					user_id: typeof req.query.user_id !== "undefined" ? Number.parseInt(req.query.user_id, 10) : null,
					action: typeof req.query.action === "string" ? req.query.action : null,
					object_type: typeof req.query.object_type === "string" ? req.query.object_type : null,
				},
			);

			const filters = {
				query: data.query,
				date_from: data.date_from,
				date_to: data.date_to,
				user_id: data.user_id,
				action: data.action,
				object_type: data.object_type,
			};

			const result = await internalAuditLog.getExport(res.locals.access, filters, data.format);

			if (data.format === "csv") {
				res.setHeader("Content-Type", "text/csv");
				res.setHeader("Content-Disposition", 'attachment; filename="audit-log-export.csv"');
				res.status(200).send(result);
			} else {
				res.setHeader("Content-Type", "application/json");
				res.setHeader("Content-Disposition", 'attachment; filename="audit-log-export.json"');
				res.status(200).send(result);
			}
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * /api/audit-log/cleanup
 */
router
	.route("/cleanup")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * POST /api/audit-log/cleanup
	 *
	 * Cleanup old audit log entries (admin only)
	 */
	.post(async (req, res, next) => {
		try {
			await res.locals.access.can("auditlog:list");

			const data = await validator(
				{
					additionalProperties: false,
					properties: {
						max_age_days: {
							type: "integer",
							minimum: 0,
							default: 0,
						},
						max_entries: {
							type: "integer",
							minimum: 0,
							default: 0,
						},
					},
				},
				{
					max_age_days: typeof req.body.max_age_days !== "undefined" ? req.body.max_age_days : 0,
					max_entries: typeof req.body.max_entries !== "undefined" ? req.body.max_entries : 0,
				},
			);

			const deletedCount = await internalAuditLog.cleanup(data.max_age_days, data.max_entries);
			res.status(200).send({ deleted: deletedCount });
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * Specific audit log entry
 *
 * /api/audit-log/123
 */
router
	.route("/:event_id")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/audit-log/123
	 *
	 * Retrieve a specific entry
	 */
	.get(async (req, res, next) => {
		try {
			const data = await validator(
				{
					required: ["event_id"],
					additionalProperties: false,
					properties: {
						event_id: {
							$ref: "common#/properties/id",
						},
						expand: {
							$ref: "common#/properties/expand",
						},
					},
				},
				{
					event_id: req.params.event_id,
					expand:
						typeof req.query.expand === "string"
							? req.query.expand.split(",")
							: null,
				},
			);

			const item = await internalAuditLog.get(res.locals.access, {
				id: data.event_id,
				expand: data.expand,
			});
			res.status(200).send(item);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

export default router;
