import { IconClipboard, IconClipboardCheck } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { T } from "src/locale";

interface LogViewerProps {
	lines: string[];
	isLoading: boolean;
	totalSize?: number;
	autoScroll?: boolean;
	searchText?: string;
}

function formatFileSize(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

function highlightSearch(line: string, search?: string): React.ReactNode {
	if (!search || search.length === 0) return line;

	const lowerLine = line.toLowerCase();
	const lowerSearch = search.toLowerCase();
	const parts: React.ReactNode[] = [];
	let lastIndex = 0;
	let idx = lowerLine.indexOf(lowerSearch);

	while (idx !== -1) {
		if (idx > lastIndex) {
			parts.push(line.substring(lastIndex, idx));
		}
		parts.push(
			<mark key={idx} style={{ backgroundColor: "#fbbf24", color: "#000", padding: 0 }}>
				{line.substring(idx, idx + search.length)}
			</mark>,
		);
		lastIndex = idx + search.length;
		idx = lowerLine.indexOf(lowerSearch, lastIndex);
	}

	if (lastIndex < line.length) {
		parts.push(line.substring(lastIndex));
	}

	return parts.length > 0 ? <>{parts}</> : line;
}

export function LogViewer({ lines, isLoading, totalSize, autoScroll = true, searchText }: LogViewerProps) {
	const containerRef = useRef<HTMLPreElement>(null);
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (autoScroll && containerRef.current) {
			containerRef.current.scrollTop = containerRef.current.scrollHeight;
		}
	}, [lines, autoScroll]);

	const handleCopy = useCallback(async () => {
		const text = lines.join("\n");
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// Fallback for older browsers
			const textarea = document.createElement("textarea");
			textarea.value = text;
			document.body.appendChild(textarea);
			textarea.select();
			document.execCommand("copy");
			document.body.removeChild(textarea);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	}, [lines]);

	return (
		<div className="log-viewer">
			<div className="d-flex justify-content-between align-items-center mb-2">
				<div className="text-muted small">
					{totalSize !== undefined && totalSize > 0 && (
						<span className="me-3">
							<T id="logs.file-size" />: {formatFileSize(totalSize)}
						</span>
					)}
					<span>
						<T id="logs.line-count" />: {lines.length}
					</span>
				</div>
				<button
					type="button"
					className="btn btn-sm btn-ghost-secondary"
					onClick={handleCopy}
					disabled={lines.length === 0}
					title={copied ? "Copied!" : "Copy to clipboard"}
				>
					{copied ? <IconClipboardCheck size={16} /> : <IconClipboard size={16} />}
					<span className="ms-1">
						{copied ? <T id="logs.copied" /> : <T id="logs.copy-to-clipboard" />}
					</span>
				</button>
			</div>
			<pre
				ref={containerRef}
				style={{
					fontFamily: "ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace",
					fontSize: "0.8125rem",
					lineHeight: "1.5",
					backgroundColor: "var(--tblr-bg-surface-dark, #1e293b)",
					color: "var(--tblr-light, #e2e8f0)",
					borderRadius: "0.375rem",
					padding: "1rem",
					maxHeight: "500px",
					overflowY: "auto",
					overflowX: "auto",
					margin: 0,
					whiteSpace: "pre-wrap",
					wordBreak: "break-all",
				}}
			>
				{isLoading && (
					<span className="text-muted">
						<T id="loading" />
					</span>
				)}
				{!isLoading && lines.length === 0 && (
					<span className="text-muted">
						<T id="logs.empty" />
					</span>
				)}
				{!isLoading &&
					lines.map((line, idx) => (
						<div key={idx}>{highlightSearch(line, searchText)}</div>
					))}
			</pre>
		</div>
	);
}
