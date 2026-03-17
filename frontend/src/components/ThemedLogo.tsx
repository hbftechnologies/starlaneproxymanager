import type { CSSProperties } from "react";

interface ThemedLogoProps {
	className?: string;
	width?: number;
	height?: number;
	alt?: string;
	style?: CSSProperties;
}

const logo = "/images/starlane/svg/512x512_spm_minimalistic.svg";

export default function ThemedLogo({ className, width, height, alt = "Starlane Proxy Manager", style }: ThemedLogoProps) {
	return (
		<img
			src={logo}
			alt={alt}
			className={className}
			width={width}
			height={height}
			style={style}
		/>
	);
}
