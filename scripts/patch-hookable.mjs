#!/usr/bin/env node
// ShareYouSee postinstall hookable patch:
// hookable 6.x serialTaskCaller/parallelTaskCaller return undefined when no hook
// is registered, breaking Nitro's `await callHook(...).catch(...)`.
// Patch: return Promise.resolve() instead of undefined.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const target = resolve(process.cwd(), 'node_modules/hookable/dist/index.mjs')

try {
  let src = readFileSync(target, 'utf8')
  const before = src

  // Patch 1: serialTaskCaller
  src = src.replace(
    /function serialTaskCaller\(hooks, args, name\) \{\n\tif \(hooks\.length > 0\) return callHooks\(hooks, args, 0, createTask\(name\)\);\n\}/,
    `function serialTaskCaller(hooks, args, name) {
	if (hooks.length > 0) return callHooks(hooks, args, 0, createTask(name));
	return Promise.resolve();
}`
  )

  // Patch 2: parallelTaskCaller
  src = src.replace(
    /function parallelTaskCaller\(hooks, args, name\) \{\n\tif \(hooks\.length > 0\) \{\n\t\tconst task = createTask\(name\);\n\t\treturn Promise\.all\(hooks\.map\(\(hook\) => task\.run\(\(\) => hook\(\.\.\.args\)\)\)\);\n\t\}\n\}/,
    `function parallelTaskCaller(hooks, args, name) {
	if (hooks.length > 0) {
		const task = createTask(name);
		return Promise.all(hooks.map((hook) => task.run(() => hook(...args))));
	}
	return Promise.resolve();
}`
  )

  if (src !== before) {
    writeFileSync(target, src)
    console.log('[patches/hookable.mjs] Applied hookable fix')
  } else {
    console.log('[patches/hookable.mjs] hookable already patched or pattern not matched')
  }
} catch (e) {
  console.warn('[patches/hookable.mjs] failed:', e.message)
}
