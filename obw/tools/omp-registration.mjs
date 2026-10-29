import assert from "node:assert/strict";

/** @param {{ commands: Map<string, unknown>, handlers: Map<string, unknown[]>, tools: Map<string, unknown> }} extension */
export function assertOmpWritebackRegistration(extension) {
	assert.deepEqual([...extension.commands.keys()].sort(), ["issue", "obw-bind", "obw-sync", "obw-unbind"], "OMP must register /issue and the three binding commands once each");
	assert.deepEqual([...extension.tools.keys()].sort(), ["pm_note", "pm_status", "pm_tick"], "OMP must register the three pm tools once each");
	for (const event of ["message_end", "input", "session_start", "session_switch", "session_branch", "session_tree", "session_before_switch", "session_before_branch", "session_before_tree", "session_shutdown"]) {
		assert.equal(extension.handlers.get(event)?.length, 1, `Exactly one ${event} observer is required`);
	}
	// Work start moved to message_end on OMP (dual-host-plan §9); a context observer would record a turn twice.
	for (const event of ["context", "agent_end", "session_stop", "turn_end", "message_start", "before_agent_start", "agent_start"]) {
		assert.equal(extension.handlers.has(event), false, `OBW must not observe ${event} on OMP`);
	}
}
