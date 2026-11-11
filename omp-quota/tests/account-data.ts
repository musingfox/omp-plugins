// A redacted snapshot must stay free of account data: this guard names the paths that carry any.
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/
const SENSITIVE_KEYS = ['metadata', 'email', 'accountid', 'projectid', 'userid', 'tokenid']
const HARMLESS_KEYS = ['accountswithoutusage', 'disabledcredentials']

export function accountDataIn(node: unknown, path = '', inSensitive = false): string[] {
	if (Array.isArray(node)) return node.flatMap((item, i) => accountDataIn(item, path ? `${path}.${i}` : `${i}`, inSensitive))
	if (node !== null && typeof node === 'object') {
		return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) => {
			const here = path ? `${path}.${key}` : key
			const lower = key.toLowerCase()
			if (!inSensitive && HARMLESS_KEYS.includes(lower)) return []
			const flagged = inSensitive || SENSITIVE_KEYS.some((s) => lower.includes(s))
			return [...(flagged ? [here] : []), ...accountDataIn(value, here, flagged)]
		})
	}
	if (typeof node === 'string' && EMAIL.test(node) && !inSensitive) return [path]
	return []
}
