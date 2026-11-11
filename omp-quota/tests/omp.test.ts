import { expect, test } from 'bun:test'
import { createQuota, type OmpQuotaRuntime } from '../omp.ts'
import { bandLinesOf } from '../controller.ts'
import { NOW, SNAPSHOT_STDOUT, fixtureWith } from './snapshot.ts'

function environment(interactive = true, reports = [SNAPSHOT_STDOUT]) {
	const entries: { type: string; customType: string; data: unknown }[] = []
	const timers = new Set<() => void>()
	const notices: string[] = []
	const widgets: (string[] | undefined)[] = []
	let fetches = 0
	const runtime: OmpQuotaRuntime = {
		interactive,
		exec: async (_command, args) => {
			if (args[1] === 'invalidate') return { code: 0, killed: false, stdout: '' }
			fetches++
			return { code: 0, killed: false, stdout: reports.length > 1 ? reports.shift()! : reports[0] }
		},
		env: { get: async () => '/test-home' }, now: async () => NOW,
		every: (_ms, callback) => { timers.add(callback); return { cancel: () => { timers.delete(callback) } } },
		notify: (message) => { notices.push(message) }, setWidget: (_key, content) => { widgets.push(content) },
		getBranch: () => entries, appendEntry: (customType, data) => { entries.push({ type: 'custom', customType, data }) },
	}
	return { runtime, entries, timers, notices, widgets, fetches: () => fetches }
}

test('enabled preference survives recreation; hiding and shutdown release polling', async () => {
	const env = environment()
	const first = createQuota(env.runtime)
	await first.onSessionStart()
	expect(env.fetches()).toBe(0)
	expect(env.timers.size).toBe(0)
	await first.command('')
	expect(env.timers.size).toBe(1)
	await first.onShutdown()
	expect(env.timers.size).toBe(0)
	const restored = createQuota(env.runtime)
	await restored.onSessionStart()
	expect(restored.state.bandOn).toBe(true)
	expect(env.timers.size).toBe(1)
	await restored.command('')
	expect(restored.state.bandOn).toBe(false)
	expect(env.timers.size).toBe(0)
	await restored.onShutdown()
})

test('headless startup is quiet; an explicit read returns real parsed quota without polling or changing preference', async () => {
	const env = environment(false)
	const quota = createQuota(env.runtime)
	await quota.onSessionStart()
	expect(env.fetches()).toBe(0)
	const report = await quota.command('')
	expect(report).toContain('anthropic')
	expect(report).toContain('%')
	expect(env.timers.size).toBe(0)
	expect(env.entries).toEqual([])
	await quota.onShutdown()
})

test('only ok-to-worse transitions notify; a recovery re-arms the next notice', async () => {
	const warning = fixtureWith({ 'anthropic:5h': 'warning' })
	const env = environment(true, [SNAPSHOT_STDOUT, warning, warning, SNAPSHOT_STDOUT, warning])
	const quota = createQuota(env.runtime)
	await quota.onSessionStart()
	await quota.command('refresh'); expect(env.notices).toHaveLength(0)
	await quota.command('refresh'); expect(env.notices).toHaveLength(1)
	expect(env.notices[0]).toContain('anthropic')
	expect(env.notices[0]).toContain('warning')
	await quota.command('refresh'); expect(env.notices).toHaveLength(1)
	await quota.command('refresh'); expect(env.notices).toHaveLength(1)
	await quota.command('refresh'); expect(env.notices).toHaveLength(2)
	await quota.onShutdown()
})

test('a late old fetch cannot replace a newer result or redraw after shutdown', async () => {
	const env = environment()
	const older = Promise.withResolvers<string>()
	const newer = Promise.withResolvers<string>()
	const enteredOlder = Promise.withResolvers<void>()
	const enteredNewer = Promise.withResolvers<void>()
	let calls = 0
	env.runtime.exec = async (_command, args) => {
		if (args[1] === 'invalidate') return { code: 0, killed: false, stdout: '' }
		const first = calls++ === 0
		if (first) enteredOlder.resolve(); else enteredNewer.resolve()
		return { code: 0, killed: false, stdout: await (first ? older.promise : newer.promise) }
	}
	const quota = createQuota(env.runtime)
	await quota.onSessionStart()
	const slow = quota.command('refresh'); await enteredOlder.promise
	const fast = quota.command('refresh'); await enteredNewer.promise
	newer.resolve(fixtureWith({ 'anthropic:5h': 'warning' })); await fast
	await quota.onShutdown()
	const rendered = env.widgets.length
	older.resolve(SNAPSHOT_STDOUT); await slow
	expect(env.widgets.length).toBe(rendered)
	const anthropic = bandLinesOf(quota.state.view, NOW).find((line) => line.startsWith('anthropic'))
	expect(anthropic).toContain('warning')
})

test('a killed CLI result is not accepted even if it has success-looking stdout', async () => {
	const env = environment()
	env.runtime.exec = async () => ({ code: 0, killed: true, stdout: SNAPSHOT_STDOUT })
	const quota = createQuota(env.runtime)
	await quota.onSessionStart(); await quota.command('refresh')
	expect(quota.state.view.lastGoodAt).toBeNull()
	expect(bandLinesOf(quota.state.view, NOW).join('\n')).not.toContain('anthropic')
	await quota.onShutdown()
})
