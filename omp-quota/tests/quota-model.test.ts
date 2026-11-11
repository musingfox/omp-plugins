import { describe, expect, test } from 'bun:test'
import { bandLinesOf, fetchUsage, publish, stateOf } from '../controller.ts'
import { quotaModelOf } from '../quota-model.ts'
import { readUsage } from '../usage.ts'
import { NOW, SNAPSHOT_STDOUT, fixtureWith } from './snapshot.ts'

const GOOD = readUsage({ kind: 'exited', exitCode: 0, stdout: SNAPSHOT_STDOUT })
if (!GOOD.ok) throw new Error(GOOD.reason)

describe('quotaModelOf', () => {
	test('loading, unavailable and stale states remain distinguishable without discarding good providers', () => {
		const loading = quotaModelOf({ usage: null, failure: null, lastGoodAt: null }, NOW)
		const unavailable = quotaModelOf({ usage: null, failure: 'CLI_UNAVAILABLE', lastGoodAt: null }, NOW)
		const stale = quotaModelOf({ usage: GOOD.usage, failure: 'FETCH_TIMEOUT', lastGoodAt: NOW }, NOW)
		expect(loading.providers).toEqual([])
		expect(unavailable.providers).toEqual([])
		expect(unavailable.notice).toContain('CLI_UNAVAILABLE')
		expect(loading.notice).not.toBe(unavailable.notice)
		expect(stale.notice).toContain('FETCH_TIMEOUT')
		expect(stale.providers.map((provider) => provider.provider)).toEqual(quotaModelOf({ usage: GOOD.usage, failure: null, lastGoodAt: NOW }, NOW).providers.map((provider) => provider.provider))
	})

	test('stale age uses the last good fetch across minute, hour and day boundaries', () => {
		const view = { usage: GOOD.usage, failure: 'FETCH_TIMEOUT', lastGoodAt: NOW }
		expect(quotaModelOf(view, NOW + 5 * 60_000).notice).toContain('5m')
		expect(quotaModelOf(view, NOW + 60 * 60_000).notice).toContain('1h 0m')
		expect(quotaModelOf(view, NOW + 24 * 60 * 60_000).notice).toContain('1d 0h')
	})

	test('orders providers from the least share left and drops one reporting no limits', () => {
		const model = quotaModelOf({ usage: GOOD.usage, failure: null, lastGoodAt: NOW }, NOW)
		expect(model.notice).toBe(null)
		expect(model.providers.map((p) => p.provider)).toEqual([
			'cursor',
			'openai-codex',
			'anthropic',
			'google-antigravity',
			'xai-oauth',
		])
	})

	test('repeated shared windows collapse into one cell, soonest reset first', () => {
		const model = quotaModelOf({ usage: GOOD.usage, failure: null, lastGoodAt: NOW }, NOW)
		const antigravity = model.providers.find((p) => p.provider === 'google-antigravity')!
		expect(antigravity.windows.map((w) => w.window)).toEqual(['5 Hour', 'Weekly'])
	})
})

describe('quota display contracts', () => {
	test('window columns align across providers without fixing literal padding', () => {
		const view = { usage: GOOD.usage, failure: null, lastGoodAt: NOW }
		const providers = quotaModelOf(view, NOW).providers
		const lines = bandLinesOf(view, NOW)
		for (const column of [0, 1]) {
			const starts = providers.flatMap((provider, index) => {
				const window = provider.windows[column]
				if (!window) return []
				const position = lines[index].indexOf(window.window, provider.provider.length)
				expect(position).toBeGreaterThanOrEqual(0)
				return [position]
			})
			expect(new Set(starts).size).toBe(1)
		}
	})

	test('a worsened window is visible on its own provider row', () => {
		const reading = readUsage({ kind: 'exited', exitCode: 0, stdout: fixtureWith({ 'anthropic:5h': 'warning' }) })
		if (!reading.ok) throw new Error(reading.reason)
		const row = bandLinesOf({ usage: reading.usage, failure: null, lastGoodAt: NOW }, NOW).find((line) => line.startsWith('anthropic'))
		expect(row).toContain('warning')
	})
})

describe('stateOf and publish ordering', () => {
	test('an older fetch does not put stale data back on screen', async () => {
		const state = stateOf()
		const ui = { notify: () => {}, render: () => {} }
		// Start the slow fetch first, then publish a newer one, then the slow one lands.
		await publish(state, 2, { ok: true, usage: { providers: [{ provider: 'new', limits: [], share: null, status: null }] } }, NOW, ui)
		await fetchUsage(
			() => Promise.reject(new Error('unused')),
			{ ok: true, usage: { providers: [{ provider: 'old', limits: [], share: null, status: null }] } },
			NOW,
			state,
			ui,
		)
		expect(state.view.usage?.providers.map((p) => p.provider)).toEqual(['new'])
	})
})
