import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

test("commands reference skills by the skill:// scheme", () => {
	const dir = new URL("../commands/", import.meta.url);
	for (const name of readdirSync(dir)) {
		const body = readFileSync(new URL(name, dir), "utf8");
		expect(body).not.toMatch(/skill:\/(?!\/)/);
	}
});
