import { quotaModelOf } from './quota-model.ts'
import type { QuotaView, WindowCell } from './quota-model.ts'
import { readUsage, worsenedProviders } from './usage.ts'
import type { OmpOutcome, UsageReading } from './usage.ts'

export const FETCH_ARGV = ['usage', '--json']
export const INVALIDATE_ARGV = ['usage', 'invalidate']
export const POLL_MS = 300_000
// A cold fetch across all providers took about 10 s on 2026-09-25.
export const OMP_TIMEOUT_MS = 30_000

export type OmpRun = (argv: string[]) => Promise<OmpOutcome>
export type PublishUi = {
	/** One in-session notification, on a worsening only. */
	notify(message: string): void
	/** Redraw whatever displays the band after the view changed. */
	render(): void
}

export type QuotaState = {
	view: QuotaView
	bandOn: boolean
	fetchesStarted: number
	lastPublished: number
}

export function stateOf(view: QuotaView = { usage: null, failure: null, lastGoodAt: null }, bandOn = false): QuotaState {
	return { view, bandOn, fetchesStarted: 0, lastPublished: 0 }
}

// A fetch that started before one already published would put older data back on screen.
export async function publish(
	state: QuotaState,
	seq: number,
	reading: UsageReading,
	now: number,
	ui: PublishUi,
): Promise<void> {
	if (seq < state.lastPublished) return
	state.lastPublished = seq
	if (reading.ok) {
		const worsened = worsenedProviders(state.view.usage, reading.usage)
		state.view = { usage: reading.usage, failure: null, lastGoodAt: now }
		if (worsened.length) ui.notify(`omp quota: ${worsened.map((w) => `${w.provider} now ${w.status}`).join(', ')}`)
	} else {
		state.view = { ...state.view, failure: reading.reason }
	}
	ui.render()
}

export async function fetchUsage(
	run: OmpRun,
	reading: Promise<UsageReading> | UsageReading,
	now: number,
	state: QuotaState,
	ui: PublishUi,
): Promise<void> {
	const seq = ++state.fetchesStarted
	await publish(state, seq, await reading, now, ui)
}

export async function refresh(
	run: OmpRun,
	now: number,
	state: QuotaState,
	ui: PublishUi,
): Promise<string> {
	const invalidated = await run(INVALIDATE_ARGV)
	const seq = ++state.fetchesStarted
	const reading = readUsage(await run(FETCH_ARGV))
	await publish(state, seq, reading, now, ui)
	const note = invalidated.kind === 'exited' && invalidated.exitCode === 0 ? '' : ' (cache not invalidated)'
	return reading.ok ? `omp quota refreshed${note}` : `omp quota refresh failed: ${reading.reason}${note}`
}

// Every window cell is padded to the widest one in its column, so windows line up across
// providers; a line's last cell is left unpadded so no line ends in spaces.
export function bandLinesOf(view: QuotaView, nowMs: number): string[] {
	const model = quotaModelOf(view, nowMs)
	const cells = model.providers.flatMap((p) => p.windows)
	const nameWidth = Math.max(0, ...model.providers.map((p) => p.provider.length))
	const windowWidth = Math.max(0, ...cells.map((c) => c.window.length))
	const cellText = (c: WindowCell) =>
		`${c.window.padEnd(windowWidth)} ${c.share.padStart(4)} ${c.resets}${c.status ? ` ${c.status}` : ''}`
	const columnWidths: number[] = []
	for (const { windows } of model.providers) {
		windows.slice(0, -1).forEach((c, i) => (columnWidths[i] = Math.max(columnWidths[i] ?? 0, cellText(c).length)))
	}
	const lines = model.providers.map(({ provider, windows }) =>
		[
			provider.padEnd(nameWidth),
			...windows.map((c, i) => cellText(c).padEnd(i === windows.length - 1 ? 0 : columnWidths[i]!)),
		]
			.join('  ')
			.trimEnd(),
	)
	if (model.notice) lines.unshift(model.notice)
	return lines
}
