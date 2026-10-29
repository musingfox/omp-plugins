import assert from "node:assert/strict";

/** @param {{ commands: Map<string, unknown>, handlers: Map<string, unknown[]> }} extension */
export function assertPiWritebackRegistration(extension) {
	assert.deepEqual([...extension.commands.keys()].sort(), ["issue", "obw-bind", "obw-sync", "obw-unbind"], "Pi must register explicit sync before dispatcher tests can submit it");
	for (const event of ["context", "input", "session_start", "session_tree", "session_before_tree", "session_before_switch", "session_before_fork", "session_shutdown"]) {
		assert.equal(extension.handlers.get(event)?.length, 1, `Exactly one ${event} observer is required`);
	}
	for (const event of ["agent_end", "agent_settled", "turn_end", "message_start", "message_end", "before_agent_start", "agent_start"]) {
		assert.equal(extension.handlers.has(event), false, `OBW must not write automatic results from ${event}`);
	}
}
