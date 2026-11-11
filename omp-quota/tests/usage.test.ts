import { describe, expect, test } from 'bun:test'
import { readUsage, remainingShareOf, worsenedProviders } from '../usage.ts'
import { SNAPSHOT, SNAPSHOT_STDOUT, fixtureWith } from './snapshot.ts'

function usageOf(stdout: string) {
	const reading = readUsage({ kind: 'exited', exitCode: 0, stdout })
	if (!reading.ok) throw new Error(reading.reason)
	return reading.usage
}

describe('remainingShareOf', () => {
	test('prefers remainingFraction', () => {
		expect(Math.abs(remainingShareOf({ remainingFraction: 0.06000000000000005, usedFraction: 0.94 })! - 0.06)).toBeLessThan(0.005)
	})
	test('falls back to one minus usedFraction', () => {
		expect(remainingShareOf({ used: 100, usedFraction: 1, unit: 'percent' })).toBe(0)
	})
	test('clamps an overdrawn usedFraction to zero', () => {
		expect(remainingShareOf({ usedFraction: 1.009 })).toBe(0)
	})
	test('is none when neither fraction is given', () => {
		expect(remainingShareOf({ used: 0, unit: 'requests' })).toBe(null)
	})
	test('clamps a remainingFraction above one', () => {
		expect(remainingShareOf({ remainingFraction: 1.2 })).toBe(1)
	})
	test('ignores a remainingFraction that is not a number', () => {
		expect(remainingShareOf({ remainingFraction: 'x', usedFraction: 0.25 })).toBe(0.75)
	})
	test('is none for a missing amount', () => {
		expect(remainingShareOf(undefined)).toBe(null)
	})
})

describe('readUsage', () => {
	test('summarises every provider of the snapshot in omp order', () => {
		const providers = usageOf(SNAPSHOT_STDOUT).providers
		expect(providers.map((p) => p.provider)).toEqual([
			'openai-codex',
			'ollama-cloud',
			'google-antigravity',
			'xai-oauth',
			'cursor',
			'anthropic',
		])
		expect(providers.map((p) => p.limits.length)).toEqual([2, 0, 6, 1, 4, 3])
		expect(providers.map((p) => p.status)).toEqual(['warning', null, 'ok', 'ok', 'exhausted', 'ok'])
		const shares = providers.map((p) => p.share)
		const expected = [0.06, null, 1, 1, 0, 0.86]
		shares.forEach((s, i) => {
			if (s === null) expect(expected[i]).toBe(null)
			else expect(Math.abs(s - expected[i]!)).toBeLessThan(0.005)
		})
	})

	test('keeps a limit with no status or fractions, and reads usedFraction alone', () => {
		const cursor = usageOf(SNAPSHOT_STDOUT).providers.find((p) => p.provider === 'cursor')!
		const gpt4 = cursor.limits.find((l) => l.id === 'cursor:requests:gpt-4')!
		expect(gpt4.status).toBe(null)
		expect(gpt4.share).toBe(null)
		expect(gpt4.resetsAt).toBe(1789749656000)
		expect(cursor.limits.find((l) => l.id === 'cursor:usd:individual-auto')!.share).toBe(0)
	})

	test('an empty report list is a failure, not data', () => {
		expect(readUsage({ kind: 'exited', exitCode: 0, stdout: '{"reports":[],"capacity":{}}' })).toEqual({
			ok: false,
			reason: 'omp reported no providers',
		})
	})

	test('a non-zero exit is a failure whatever stdout holds', () => {
		expect(readUsage({ kind: 'exited', exitCode: 1, stdout: SNAPSHOT_STDOUT })).toEqual({ ok: false, reason: 'omp exited 1' })
	})

	test('stdout that is not JSON is a failure', () => {
		expect(readUsage({ kind: 'exited', exitCode: 0, stdout: 'not json' })).toEqual({ ok: false, reason: 'omp output unreadable' })
	})

	test('a run that never answered is a failure', () => {
		expect(readUsage({ kind: 'rejected' })).toEqual({ ok: false, reason: 'omp did not answer' })
	})
})

describe('worsenedProviders', () => {
	test('flags a provider whose status went ok to warning or exhausted', () => {
		const before = usageOf(SNAPSHOT_STDOUT)
		const after = usageOf(fixtureWith({ 'anthropic:5h': 'warning', 'xai-oauth:credits:1w': 'exhausted' }))
		expect(worsenedProviders(before, after).sort((a, b) => a.provider.localeCompare(b.provider))).toEqual([
			{ provider: 'anthropic', status: 'warning' },
			{ provider: 'xai-oauth', status: 'exhausted' },
		])
	})

	test('flags nothing on the first good fetch', () => {
		expect(worsenedProviders(null, usageOf(SNAPSHOT_STDOUT))).toEqual([])
	})

	test('does not flag warning to exhausted, recovery, or a newly appearing provider', () => {
		const before = usageOf(fixtureWith({ 'openai-codex:secondary': 'warning', 'anthropic:5h': 'exhausted', 'cursor:usd:individual-auto': undefined }))
		const after = usageOf(fixtureWith({ 'openai-codex:secondary': 'exhausted', 'anthropic:5h': 'ok' }))
		expect(worsenedProviders(before, after)).toEqual([])
	})
})
