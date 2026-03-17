import fs from "node:fs";
import path from "node:path";

const LOG_DIR = "/data/logs";
const MAX_LINES = 1000;
const CHUNK_SIZE = 8192;
const MAX_SCAN_LINES = 10000;

const internalNginxLog = {
	/**
	 * Read the last N lines of a log file efficiently.
	 * Uses reverse file reading to avoid loading entire file into memory.
	 *
	 * @param   {String}  filePath  - absolute path to log file
	 * @param   {Number}  lines     - number of lines to return (default 100, max 1000)
	 * @param   {String}  search    - optional text filter
	 * @returns {Promise<{lines: string[], totalSize: number, fileName: string, lineCount: number}>}
	 */
	tail: async (filePath, lines = 100, search = null) => {
		internalNginxLog.validatePath(filePath);

		lines = Math.min(Math.max(lines, 1), MAX_LINES);

		const fileName = path.basename(filePath);

		// Check if file exists
		try {
			await fs.promises.access(filePath, fs.constants.R_OK);
		} catch {
			return {
				lines: [],
				totalSize: 0,
				fileName,
				lineCount: 0,
			};
		}

		const stat = await fs.promises.stat(filePath);
		const totalSize = stat.size;

		if (totalSize === 0) {
			return {
				lines: [],
				totalSize: 0,
				fileName,
				lineCount: 0,
			};
		}

		const fd = await fs.promises.open(filePath, "r");

		try {
			const resultLines = [];
			let position = totalSize;
			let remainder = "";
			let scannedLines = 0;

			while (position > 0 && (search ? resultLines.length < lines : resultLines.length <= lines) && scannedLines < MAX_SCAN_LINES) {
				const readSize = Math.min(CHUNK_SIZE, position);
				position -= readSize;

				const buffer = Buffer.alloc(readSize);
				await fd.read(buffer, 0, readSize, position);

				const chunk = buffer.toString("utf8") + remainder;
				const chunkLines = chunk.split("\n");

				// The first element is a partial line (or empty), save for next iteration
				remainder = chunkLines.shift() || "";

				// Process lines in reverse order (newest first)
				for (let i = chunkLines.length - 1; i >= 0; i--) {
					const line = chunkLines[i];
					if (line.length === 0) continue;

					scannedLines++;

					if (search) {
						if (line.toLowerCase().includes(search.toLowerCase())) {
							resultLines.push(line);
						}
					} else {
						resultLines.push(line);
					}

					if (resultLines.length >= lines) break;
				}
			}

			// Handle any remaining partial line at the start of the file
			if (remainder.length > 0 && resultLines.length < lines && position === 0) {
				if (search) {
					if (remainder.toLowerCase().includes(search.toLowerCase())) {
						resultLines.push(remainder);
					}
				} else {
					resultLines.push(remainder);
				}
			}

			// Reverse to get chronological order (oldest first)
			resultLines.reverse();

			return {
				lines: resultLines,
				totalSize,
				fileName,
				lineCount: resultLines.length,
			};
		} finally {
			await fd.close();
		}
	},

	/**
	 * Get file metadata (size, last modified) without reading content.
	 *
	 * @param   {String}  filePath
	 * @returns {Promise<{size: number, modified: string} | null>}
	 */
	getFileInfo: async (filePath) => {
		internalNginxLog.validatePath(filePath);

		try {
			const stat = await fs.promises.stat(filePath);
			return {
				size: stat.size,
				modified: stat.mtime.toISOString(),
			};
		} catch {
			return null;
		}
	},

	/**
	 * Verify a log file path is safe (within /data/logs/) to prevent path traversal.
	 *
	 * @param   {String}  filePath
	 * @throws  {Error}   If path is outside allowed directory
	 */
	validatePath: (filePath) => {
		const resolved = path.resolve(filePath);
		const logDir = path.resolve(LOG_DIR);

		if (!resolved.startsWith(logDir + path.sep) && resolved !== logDir) {
			throw new Error("Access denied: log file path is outside the allowed directory");
		}
	},

	/**
	 * Build the access log path for a proxy host
	 *
	 * @param   {Number}  hostId
	 * @returns {String}
	 */
	getAccessLogPath: (hostId) => {
		return path.join(LOG_DIR, `proxy-host-${hostId}_access.log`);
	},

	/**
	 * Build the error log path for a proxy host
	 *
	 * @param   {Number}  hostId
	 * @returns {String}
	 */
	getErrorLogPath: (hostId) => {
		return path.join(LOG_DIR, `proxy-host-${hostId}_error.log`);
	},
};

export default internalNginxLog;
