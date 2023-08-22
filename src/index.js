import { promises as fs } from "fs"
import core from "@actions/core"
import { GitHub, context } from "@actions/github"
import path from "path"

import { readMerged } from "./lcov"
import { diff } from "./comment"
import { getChangedFiles } from "./get_changes"
import { deleteOldComments } from "./delete_old_comments"
import { normalisePath } from "./util"

const MAX_COMMENT_CHARS = 65536

async function main() {
	const token = core.getInput("github-token")
	const githubClient = new GitHub(token)
	const workingDir = core.getInput('working-directory') || './';
	const lcovPaths = core.getMultilineInput("lcov-paths") || ["./coverage/lcov.info"]
	const basePaths = core.getMultilineInput("lcov-base-paths")
	const shouldFilterChangedFiles =
		core.getInput("filter-changed-files").toLowerCase() === "true"
	const shouldDeleteOldComments =
		core.getInput("delete-old-comments").toLowerCase() === "true"
	const title = core.getInput("title")

	const options = {
		repository: context.payload.repository.full_name,
		prefix: normalisePath(`${process.env.GITHUB_WORKSPACE}/`),
		workingDir,
	}

	if (context.eventName === "pull_request") {
		options.commit = context.payload.pull_request.head.sha
		options.baseCommit = context.payload.pull_request.base.sha
		options.head = context.payload.pull_request.head.ref
		options.base = context.payload.pull_request.base.ref
	} else if (context.eventName === "push") {
		options.commit = context.payload.after
		options.baseCommit = context.payload.before
		options.head = context.ref
	}

	options.shouldFilterChangedFiles = shouldFilterChangedFiles
	options.title = title

	if (shouldFilterChangedFiles) {
		options.changedFiles = await getChangedFiles(githubClient, options, context)
	}

	const lcov = await readMerged(lcovPaths, workingDir)
	const baselcov = basePaths.length > 0 && (await readMerged(basePaths, workingDir))
	const body = diff(lcov, baselcov, options).substring(0, MAX_COMMENT_CHARS)

	if (shouldDeleteOldComments) {
		await deleteOldComments(githubClient, options, context)
	}

	if (context.eventName === "pull_request") {
		await githubClient.issues.createComment({
			repo: context.repo.repo,
			owner: context.repo.owner,
			issue_number: context.payload.pull_request.number,
			body: body,
		})
	} else if (context.eventName === "push") {
		await githubClient.repos.createCommitComment({
			repo: context.repo.repo,
			owner: context.repo.owner,
			commit_sha: options.commit,
			body: body,
		})
	}
}

main().catch(function(err) {
	console.log(err)
	core.setFailed(err.message)
})
