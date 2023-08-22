import { promises as fs } from "fs"
import path from "path"
import lcov from "lcov-parse"
import * as glob from '@actions/glob'

// Parse lcov string into lcov data
export function parse(data) {
	return new Promise(function(resolve, reject) {
		lcov(data, function(err, res) {
			if (err) {
				reject(err)
				return
			}
			resolve(res)
		})
	})
}

// Get the total coverage percentage from the lcov data.
export function percentage(lcov) {
	let hit = 0
	let found = 0
	for (const entry of lcov) {
		hit += entry.lines.hit
		found += entry.lines.found
	}

	return (hit / found) * 100
}

export async function readMerged(globPatterns, baseDir = "", followSymlink = true) {
	const merged = []
	for (const pattern of globPatterns) {
		const globber = await glob.create(
			path.join(baseDir, pattern),
			{ followSymbolicLinks: followSymlink },
		)

		for await (const result of globber.globGenerator()) {
			const lcov = await fs.readFile(result, "utf-8")
			const parsed = await parse(lcov)
			merged.push(...parsed)
		}
	}
  return merged
}