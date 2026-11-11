import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from '@earendil-works/pi-coding-agent'
import { createQuota } from './omp.ts'
import type { OmpQuotaRuntime, QuotaCommands } from './omp.ts'

export default function extension(pi: ExtensionAPI): void {
	let quota: QuotaCommands | undefined

	const runtimeFor = (ctx: ExtensionContext): OmpQuotaRuntime => ({
		interactive: ctx.mode === 'tui',
		exec: (command, args, options) => pi.exec('env', ['-u', 'PI_CODING_AGENT_DIR', command, ...args], options),
		env: { get: (key) => Promise.resolve(key === 'HOME' ? process.env.HOME : undefined) },
		now: () => Promise.resolve(Date.now()),
		every: (ms, callback) => {
			// Pi clears nothing for us; the cancel goes into session_shutdown.
			const timer = setInterval(callback, ms)
			return { cancel: () => clearInterval(timer) }
		},
		notify: (message, type) => {
			if (ctx.hasUI) ctx.ui.notify(message, type)
		},
		setWidget: (key, content) => {
			if (ctx.hasUI) ctx.ui.setWidget(key, content)
		},
		getBranch: () => ctx.sessionManager.getBranch(),
		appendEntry: (customType, data) => pi.appendEntry(customType, data),
	})

	const restore = async (_event: unknown, ctx: ExtensionContext) => {
		await quota?.onShutdown()
		quota = createQuota(runtimeFor(ctx))
		await quota.onSessionStart()
	}
	pi.on('session_start', restore)
	pi.on('session_tree', restore)

	pi.on('session_shutdown', async () => {
		await quota?.onShutdown()
		quota = undefined
	})

	pi.registerCommand('quota', {
		description: 'Show omp provider quota',
		handler: async (args, ctx: ExtensionCommandContext) => {
			if (!quota) {
				quota = createQuota(runtimeFor(ctx))
				await quota.onSessionStart()
			}
			const current = quota
			const answer = await current.command(args)
			if (current !== quota) return
			if (answer !== undefined) {
				if (ctx.hasUI) ctx.ui.notify(answer, 'info')
				else console.error(`omp-quota: ${answer}`)
			}
		},
	})
}
