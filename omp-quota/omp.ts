import { FETCH_ARGV, OMP_TIMEOUT_MS, POLL_MS, bandLinesOf, fetchUsage, publish, refresh, stateOf } from './controller.ts'
import type { OmpRun, PublishUi, QuotaState } from './controller.ts'
import { readUsage } from './usage.ts'
import type { OmpOutcome } from './usage.ts'

export type OmpExec = (command: string, args: string[], options: { timeout: number }) => Promise<{ stdout: string; code: number; killed: boolean }>

export type OmpQuotaRuntime = {
	interactive: boolean
	exec: OmpExec
	env: { get(key: string): Promise<string | undefined> }
	now: () => Promise<number>
	every: (ms: number, callback: () => void) => { cancel(): void }
	notify(message: string, type?: 'info' | 'warning' | 'error'): void
	setWidget(key: string, content: string[] | undefined): void
	getBranch(): unknown[]
	appendEntry(customType: string, data?: unknown): void
}

export type QuotaCommands = {
	state: QuotaState
	onSessionStart: () => Promise<void>
	onShutdown: () => Promise<void>
	command: (args: string) => Promise<string | undefined>
}

// Always use the real omp CLI; only interactive, enabled widgets poll.
async function runOmp(exec: OmpExec, argv: string[]): Promise<OmpOutcome> {
	try {
		const result = await exec('omp', argv, { timeout: OMP_TIMEOUT_MS })
		if (result.killed) return { kind: 'rejected' }
		return { kind: 'exited', exitCode: result.code, stdout: result.stdout }
	} catch {
		return { kind: 'rejected' }
	}
}

const ENTRY_TYPE = 'omp-quota-band'

function branchBandOn(branch: unknown[]): boolean {
	for (let i = branch.length - 1; i >= 0; i--) {
		const entry = branch[i] as { type?: string; customType?: string; data?: unknown }
		if (entry?.type === 'custom' && entry.customType === ENTRY_TYPE) return entry.data === true
	}
	return false
}

export function createQuota(runtime: OmpQuotaRuntime): QuotaCommands {
	const state = stateOf()
	let poll: { cancel(): void } | null = null
	let active = true
	const run: OmpRun = (argv) => runOmp(runtime.exec, argv)
	const ui: PublishUi = {
		notify: (message) => { if (active) runtime.notify(message, 'info') },
		render: () => { if (active) runtime.setWidget('omp-quota', state.bandOn ? bandLinesOf(state.view, Date.now()) : undefined) },
	}
	const fetchNow = async (): Promise<void> => {
		const home = await runtime.env.get('HOME')
		if (!home) {
			await publish(state, ++state.fetchesStarted, { ok: false, reason: 'HOME is unset' }, await runtime.now(), ui)
			return
		}
		const now = await runtime.now()
		await fetchUsage(run, run(FETCH_ARGV).then(readUsage), now, state, ui)
	}
	const stop = async () => {
		poll?.cancel()
		poll = null
	}
	const backgroundFetch = () => {
		void fetchNow().catch(() => {
			if (!active) return
			state.view = { ...state.view, failure: 'Unexpected quota refresh failure' }
			ui.render()
			runtime.notify('omp quota: refresh failed', 'error')
		})
	}
	return {
		state,
		onSessionStart: async () => {
			active = true
			state.bandOn = branchBandOn(runtime.getBranch())
			await stop()
			ui.render()
			if (runtime.interactive && state.bandOn) {
				backgroundFetch()
				poll = runtime.every(POLL_MS, backgroundFetch)
			}
		},
		onShutdown: async () => {
			active = false
			await stop()
			runtime.setWidget('omp-quota', undefined)
		},
		command: async (args) => {
			const trimmed = args.trim()
			if (!runtime.interactive && trimmed === '') {
				await fetchNow()
				return bandLinesOf(state.view, await runtime.now()).join('\n')
			}
			if (trimmed === '') {
				state.bandOn = !state.bandOn
				runtime.appendEntry(ENTRY_TYPE, state.bandOn)
				await stop()
				ui.render()
				if (state.bandOn) {
					backgroundFetch()
					poll = runtime.every(POLL_MS, backgroundFetch)
				}
				return undefined
			}
			if (trimmed !== 'refresh') return 'usage: /quota [refresh]'
			const home = await runtime.env.get('HOME')
			if (!home) {
				await publish(state, ++state.fetchesStarted, { ok: false, reason: 'HOME is unset' }, await runtime.now(), ui)
				return 'omp quota refresh failed: HOME is unset'
			}
			return refresh(run, await runtime.now(), state, ui)
		},
	}
}
