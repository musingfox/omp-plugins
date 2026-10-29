import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { assertPiWritebackRegistration } from "./pi-registration.mjs";

const { host, packageDir, entries, cwd, agentDir } = JSON.parse(process.argv[2]);
// OMP exports its loader source; pi ships its official loader beside dist/index.js.
const loaderPath = host.id === "omp"
	? join(host.root, host.pkg.exports["./extensibility/extensions/*"].import.replace("*", "loader"))
	: join(dirname(join(host.root, host.pkg.exports["."].import)), "core/extensions/loader.js");
console.log(`[check:load:${host.id}] official loader=${loaderPath}; isolated cwd=${cwd}; agentDir=${agentDir}`);
const loader = await import(pathToFileURL(loaderPath).href);
const result = host.id === "omp"
	? await loader.discoverAndLoadExtensions([packageDir], cwd, undefined, undefined, { ambient: false })
	: await loader.discoverAndLoadExtensions([packageDir], cwd, agentDir);
assert.deepEqual(result.errors, [], "Extension loading errors");
assert.deepEqual(result.extensions.map((extension) => realpathSync(extension.resolvedPath)).sort(), [...entries].sort(), "Loader must discover exactly the manifest entries");
const issueRegistrations = result.extensions.filter((extension) => extension.commands.has("issue"));
assert.equal(issueRegistrations.length, 1, "Exactly one /issue registration is required");
if (host.id === "pi") assertPiWritebackRegistration(result.extensions[0]);
if (host.id === "omp") assert.deepEqual([...result.extensions[0].tools.keys()].sort(), ["pm_note", "pm_status", "pm_tick"], "OMP must register the three pm tools once each");
console.log(`[check:load:${host.id}] PASS: ${result.extensions.length} manifest extension(s), /issue registered once${host.id === "omp" ? ", pm tools registered" : ""}; no commands/events invoked, no model or vault calls`);
