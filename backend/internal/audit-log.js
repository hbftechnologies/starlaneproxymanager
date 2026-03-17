import errs from "../lib/error.js";
import { castJsonIfNeed } from "../lib/helpers.js";
import auditLogModel from "../models/audit-log.js";

const internalAuditLog = {

	/**
	 * All logs with pagination and filtering
	 *
	 * @param   {Access}  access
	 * @param   {Array}   [expand]
	 * @param   {String}  [searchQuery]
	 * @param   {Object}  [filters]
	 * @param   {Number}  [filters.page]
	 * @param   {Number}  [filters.limit]
	 * @param   {String}  [filters.date_from]
	 * @param   {String}  [filters.date_to]
	 * @param   {Number}  [filters.user_id]
	 * @param   {String}  [filters.action]
	 * @param   {String}  [filters.object_type]
	 * @returns {Promise}
	 */
	getAll: async (access, expand, searchQuery, filters = {}) => {
		await access.can("auditlog:list");

		const page = filters.page || 1;
		const limit = filters.limit || 50;
		const offset = (page - 1) * limit;

		// Build the base query for counting
		const countQuery = auditLogModel.query();

		// Apply filters to count query
		if (typeof searchQuery === "string" && searchQuery.length > 0) {
			countQuery.where(function () {
				this.where(castJsonIfNeed("meta"), "like", `%${searchQuery}%`);
			});
		}

		if (filters.date_from) {
			countQuery.where("created_on", ">=", filters.date_from);
		}

		if (filters.date_to) {
			countQuery.where("created_on", "<=", filters.date_to);
		}

		if (filters.user_id) {
			countQuery.where("user_id", filters.user_id);
		}

		if (filters.action) {
			countQuery.where("action", filters.action);
		}

		if (filters.object_type) {
			countQuery.where("object_type", filters.object_type);
		}

		// Get total count
		const countResult = await countQuery.count("* as total").first();
		const total = countResult?.total || 0;
		const totalPages = Math.ceil(total / limit);

		// Build data query
		const query = auditLogModel
			.query()
			.orderBy("created_on", "DESC")
			.orderBy("id", "DESC")
			.limit(limit)
			.offset(offset)
			.allowGraph("[user]");

		// Apply same filters to data query
		if (typeof searchQuery === "string" && searchQuery.length > 0) {
			query.where(function () {
				this.where(castJsonIfNeed("meta"), "like", `%${searchQuery}%`);
			});
		}

		if (filters.date_from) {
			query.where("created_on", ">=", filters.date_from);
		}

		if (filters.date_to) {
			query.where("created_on", "<=", filters.date_to);
		}

		if (filters.user_id) {
			query.where("user_id", filters.user_id);
		}

		if (filters.action) {
			query.where("action", filters.action);
		}

		if (filters.object_type) {
			query.where("object_type", filters.object_type);
		}

		if (typeof expand !== "undefined" && expand !== null) {
			query.withGraphFetched(`[${expand.join(", ")}]`);
		}

		const data = await query;

		return {
			data,
			pagination: {
				total,
				page,
				limit,
				totalPages,
			},
		};
	},

	/**
	 * @param  {Access}   access
	 * @param  {Object}   [data]
	 * @param  {Integer}  [data.id]          Defaults to the token user
	 * @param  {Array}    [data.expand]
	 * @return {Promise}
	 */
	get: async (access, data) => {
		await access.can("auditlog:list");

		const query = auditLogModel
			.query()
			.andWhere("id", data.id)
			.allowGraph("[user]")
			.first();

		if (typeof data.expand !== "undefined" && data.expand !== null) {
			query.withGraphFetched(`[${data.expand.join(", ")}]`);
		}

		const row = await query;

		if (!row?.id) {
			throw new errs.ItemNotFoundError(data.id);
		}

		return row;
	},

	/**
	 * Export audit logs with filters, no pagination, hard cap of 10,000 rows
	 *
	 * @param   {Access}  access
	 * @param   {Object}  filters
	 * @param   {String}  format  - 'csv' or 'json'
	 * @returns {Promise}
	 */
	getExport: async (access, filters = {}, format = "json") => {
		await access.can("auditlog:list");

		const maxExportRows = 10000;

		const query = auditLogModel
			.query()
			.orderBy("created_on", "DESC")
			.orderBy("id", "DESC")
			.limit(maxExportRows)
			.allowGraph("[user]")
			.withGraphFetched("[user]");

		if (filters.query && filters.query.length > 0) {
			query.where(function () {
				this.where(castJsonIfNeed("meta"), "like", `%${filters.query}%`);
			});
		}

		if (filters.date_from) {
			query.where("created_on", ">=", filters.date_from);
		}

		if (filters.date_to) {
			query.where("created_on", "<=", filters.date_to);
		}

		if (filters.user_id) {
			query.where("user_id", filters.user_id);
		}

		if (filters.action) {
			query.where("action", filters.action);
		}

		if (filters.object_type) {
			query.where("object_type", filters.object_type);
		}

		const rows = await query;

		if (format === "csv") {
			const headers = ["id", "created_on", "user_id", "user_name", "action", "object_type", "object_id"];
			const csvLines = [headers.join(",")];

			for (const row of rows) {
				const values = [
					row.id,
					`"${row.created_on || ""}"`,
					row.user_id,
					`"${(row.user?.name || "").replace(/"/g, '""')}"`,
					`"${row.action}"`,
					`"${row.object_type}"`,
					row.object_id,
				];
				csvLines.push(values.join(","));
			}

			return csvLines.join("\n");
		}

		return rows;
	},

	/**
	 * Cleanup old audit log entries
	 *
	 * @param   {Number}  maxAgeDays   - Delete entries older than this many days (0 = skip)
	 * @param   {Number}  maxEntries   - Keep at most this many entries (0 = skip)
	 * @returns {Promise<Number>}      - Number of deleted entries
	 */
	cleanup: async (maxAgeDays = 0, maxEntries = 0) => {
		let deletedCount = 0;

		if (maxAgeDays > 0) {
			const cutoffDate = new Date();
			cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);
			const cutoffISO = cutoffDate.toISOString();

			const result = await auditLogModel
				.query()
				.delete()
				.where("created_on", "<", cutoffISO);

			deletedCount += result;
		}

		if (maxEntries > 0) {
			const countResult = await auditLogModel
				.query()
				.count("* as total")
				.first();

			const total = countResult?.total || 0;

			if (total > maxEntries) {
				const excess = total - maxEntries;
				// Find the IDs of the oldest entries to delete
				const oldestEntries = await auditLogModel
					.query()
					.select("id")
					.orderBy("created_on", "ASC")
					.orderBy("id", "ASC")
					.limit(excess);

				if (oldestEntries.length > 0) {
					const idsToDelete = oldestEntries.map((e) => e.id);
					const result = await auditLogModel
						.query()
						.delete()
						.whereIn("id", idsToDelete);

					deletedCount += result;
				}
			}
		}

		return deletedCount;
	},

	/**
	 * This method should not be publicly used, it doesn't check certain things. It will be assumed
	 * that permission to add to audit log is already considered, however the access token is used for
	 * default user id determination.
	 *
	 * @param   {Access}   access
	 * @param   {Object}   data
	 * @param   {String}   data.action
	 * @param   {Number}   [data.user_id]
	 * @param   {Number}   [data.object_id]
	 * @param   {Number}   [data.object_type]
	 * @param   {Object}   [data.meta]
	 * @returns {Promise}
	 */
	add: async (access, data) => {
		if (typeof data.user_id === "undefined" || !data.user_id) {
			data.user_id = access.token.getUserId(1);
		}

		if (typeof data.action === "undefined" || !data.action) {
			throw new errs.InternalValidationError("Audit log entry must contain an Action");
		}

		// Make sure at least 1 of the IDs are set and action
		return await auditLogModel.query().insert({
			user_id: data.user_id,
			action: data.action,
			object_type: data.object_type || "",
			object_id: data.object_id || 0,
			meta: data.meta || {},
		});
	},
};

export default internalAuditLog;
