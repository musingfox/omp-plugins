import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { fileURLToPath } from "node:url";

export default function searchAgent(pi: ExtensionAPI): void {
	pi.registerMcpServer("search", {
		command: "python3",
		args: [fileURLToPath(new URL("../bin/search-mcp", import.meta.url))],
		timeout: 300,
		exposure: "direct",
	});
}
