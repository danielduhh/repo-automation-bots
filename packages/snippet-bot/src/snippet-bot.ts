// Copyright 2020 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable node/no-extraneous-import */

import {Application} from 'probot';
import {Configuration, ConfigurationOptions} from './configuration';
import {DEFAULT_CONFIGURATION, CONFIGURATION_FILE_PATH} from './configuration';
import {parseRegionTags} from './region-tag-parser';
import {parseRegionTagsInPullRequest} from './region-tag-parser';
import {ParseResult} from './region-tag-parser';
import {Change} from './region-tag-parser';
import {checkProductPrefixViolations} from './violations';
import {logger} from 'gcf-utils';
import fetch from 'node-fetch';
import tmp from 'tmp-promise';

import tar from 'tar';
import util from 'util';
import fs from 'fs';
import {promises as pfs} from 'fs';
import path from 'path';

const streamPipeline = util.promisify(require('stream').pipeline);

type Conclusion =
  | 'success'
  | 'failure'
  | 'neutral'
  | 'cancelled'
  | 'timed_out'
  | 'action_required'
  | undefined;

// Solely for avoid using `any` type.
interface Label {
  name: string;
}

const FULL_SCAN_ISSUE_TITLE = 'snippet-bot full scan';

const REFRESH_LABEL = 'snippet-bot:force-run';

/**
 * Formats the full scan report with the comment mark, so that it can
 * preserve original contents.
 */
function formatBody(
  originalBody: string,
  commentMark: string,
  addition: string
): string {
  // First cut off if we already have the commentMark.
  const markIndex = originalBody.indexOf(commentMark);
  if (markIndex >= 0) {
    originalBody = originalBody.substr(0, markIndex);
  }
  return `${originalBody}${commentMark}

${addition}

---
Report generated by [snippet-bot](https://github.com/apps/snippet-bot).
If you find problems with this result, please file an issue at:
https://github.com/googleapis/repo-automation-bots/issues.
`;
}

/**
 * It formats the summary and detail as an expandable UI in the markdown.
 */
function formatExpandable(summary: string, detail: string): string {
  return `<details>
  <summary>${summary}</summary>

  ${detail}
</details>

`;
}

/**
 * It formats a region tag change as a markdown with a permalink to the code.
 */
function formatChangedFile(change: Change): string {
  const url = `https://github.com/${change.owner}/${change.repo}/blob/${change.sha}/${change.file}#L${change.line}`;
  return `[\`${change.regionTag}\` in \`${change.file}\`](${url})`;
}

async function downloadFile(url: string, file: string) {
  const response = await fetch(url);
  if (response.ok) {
    return streamPipeline(response.body, fs.createWriteStream(file));
  }
  throw new Error(`unexpected response ${response.statusText}`);
}

async function getFiles(dir: string, allFiles: string[]) {
  const files = (await pfs.readdir(dir)).map(f => path.join(dir, f));
  for (const f of files) {
    if (!(await pfs.stat(f)).isDirectory()) {
      allFiles.push(f);
    }
  }
  await Promise.all(
    files.map(
      async f => (await pfs.stat(f)).isDirectory() && getFiles(f, allFiles)
    )
  );
  return allFiles;
}

export = (app: Application) => {
  app.on(
    [
      'issues.opened',
      'issues.reopened',
      'pull_request.opened',
      'pull_request.reopened',
      'pull_request.edited',
      'pull_request.labeled',
      'pull_request.synchronize',
    ],
    async context => {
      const repoUrl = context.payload.repository.full_name;
      const defaultBranch = context.payload.repository.default_branch;
      let configOptions!: ConfigurationOptions | null;
      try {
        configOptions = await context.config<ConfigurationOptions>(
          CONFIGURATION_FILE_PATH
        );
      } catch (err) {
        err.message = `Error reading configuration: ${err.message}`;
        logger.error(err);
        // Now this bot is only enabled if it finds the configuration file.
        // Exiting.
        return;
      }

      if (configOptions === null) {
        logger.info(`snippet-bot is not configured for ${repoUrl}.`);
        return;
      }
      const configuration = new Configuration({
        ...DEFAULT_CONFIGURATION,
        ...configOptions,
      });
      logger.info({config: configuration});
      const installationId = context.payload.installation.id;
      const commentMark = `<!-- probot comment [${installationId}]-->`;
      const owner = context.payload.repository.owner.login;
      const repo = context.payload.repository.name;

      if (context.payload.issue?.title.includes(FULL_SCAN_ISSUE_TITLE)) {
        // full scan start
        const issueNumber = context.payload.issue.number;

        const url = `https://github.com/${owner}/${repo}/tarball/${defaultBranch}`;
        const tmpDir = tmp.dirSync();
        logger.info(`working directory: ${tmpDir.name}`);

        const file = `${tmpDir.name}/${repo}.tar.gz`;
        // Download the default branch tarball and run full scan.
        try {
          await downloadFile(url, file);
          logger.info(`Downloaded to ${file}`);
          tar.x({
            file: file,
            cwd: tmpDir.name,
            sync: true,
          });
          let archiveDir!: string;
          for (const f of await pfs.readdir(tmpDir.name)) {
            const cur = tmpDir.name + '/' + f;
            const stat = await pfs.lstat(cur);
            if (stat.isDirectory()) {
              archiveDir = cur;
            }
          }
          if (archiveDir === undefined) {
            throw new Error('Failed to extract the archive');
          }
          // Determine the short commit hash from the directory name.
          // We'll use the hash for creating permalink.
          let commitHash = defaultBranch; // Defaulting to the default branch.
          const lastDashIndex = archiveDir.lastIndexOf('-');
          if (lastDashIndex !== -1) {
            commitHash = archiveDir.substr(lastDashIndex + 1);
          }
          logger.info(`Using commit hash "${commitHash}"`);
          const files = await getFiles(archiveDir, []);

          let mismatchedTags = false;
          const failureMessages: string[] = [];

          for (const file of files) {
            if (configuration.ignoredFile(file)) {
              logger.info('ignoring file from configuration: ' + file);
              continue;
            }
            try {
              const fileContents = await pfs.readFile(file, 'utf-8');
              const parseResult = parseRegionTags(
                fileContents,
                file.replace(archiveDir + '/', '')
              );
              if (!parseResult.result) {
                mismatchedTags = true;
                for (const message of parseResult.messages) {
                  // Create a link to the source code at the commit.
                  const linkedMessage = message.replace(
                    /^(.+):(\d+),/,
                    `- [ ] [$1:$2](https://github.com/${owner}/${repo}/blob/${commitHash}/$1#L$2),`
                  );
                  failureMessages.push(linkedMessage);
                }
                parseResult.messages.join('\n');
              }
            } catch (err) {
              err.message = `Failed to read the file: ${err.message}`;
              logger.error(err);
              continue;
            }
          }
          let bodyDetail = 'Great job! No unmatching region tags found!';
          if (mismatchedTags) {
            bodyDetail = failureMessages.join('\n');
          }
          await context.github.issues.update({
            owner: owner,
            repo: repo,
            issue_number: issueNumber,
            body: formatBody(
              context.payload.issue.body,
              commentMark,
              `## snippet-bot scan result
Life is too short to manually check unmatched region tags.
Here is the result:
${bodyDetail}`
            ),
          });
        } catch (err) {
          err.message = `Failed to scan files: ${err.message}`;
          logger.error(err);
          await context.github.issues.update({
            owner: owner,
            repo: repo,
            issue_number: issueNumber,
            body: formatBody(
              context.payload.issue.body,
              commentMark,
              `## snippet-bot scan result\nFailed running the full scan: ${err}.`
            ),
          });
        } finally {
          // Clean up the directory.
          await pfs.rmdir(tmpDir.name, {recursive: true});
        }
      } // full scan end.

      if (context.payload.pull_request === undefined) {
        return;
      }
      if (context.payload.action === 'labeled') {
        // Only proceeds if `snippet-bot:force-run` label is added.
        if (context.payload.pull_request.labels === undefined) {
          return;
        }
        // Exits when there's no REFRESH_LABEL
        const labelFound = context.payload.pull_request.labels.some(
          (label: Label) => {
            return label.name === REFRESH_LABEL;
          }
        );
        if (!labelFound) {
          return;
        }
        // Remove the label and proceed.
        try {
          await context.github.issues.removeLabel(
            context.issue({name: REFRESH_LABEL})
          );
        } catch (err) {
          // Ignoring 404 errors.
          if (err.status !== 404) {
            throw err;
          }
        }
      }
      // Check on pull requests.

      // Parse the PR diff and recognize added/deleted region tags.
      const response = await fetch(context.payload.pull_request.diff_url);
      const diff = await response.text();

      const result = parseRegionTagsInPullRequest(
        diff,
        context.payload.pull_request.base.repo.owner.login,
        context.payload.pull_request.base.repo.name,
        context.payload.pull_request.base.sha,
        context.payload.pull_request.head.repo.owner.login,
        context.payload.pull_request.head.repo.name,
        context.payload.pull_request.head.sha
      );

      let mismatchedTags = false;
      let tagsFound = false;
      const failureMessages: string[] = [];

      // Keep track of start tags in all the files.
      const parseResults = new Map<string, ParseResult>();

      // If we found any new files, verify they all have matching region tags.
      for (const file of result.files) {
        if (configuration.ignoredFile(file)) {
          logger.info('ignoring file from configuration: ' + file);
          continue;
        }
        try {
          const blob = await context.github.repos.getContent({
            owner: context.payload.pull_request.head.repo.owner.login,
            repo: context.payload.pull_request.head.repo.name,
            path: file,
            ref: context.payload.pull_request.head.sha,
          });
          const fileContents = Buffer.from(
            blob.data.content,
            'base64'
          ).toString('utf8');

          const parseResult = parseRegionTags(fileContents, file);
          parseResults.set(file, parseResult);
          if (!parseResult.result) {
            mismatchedTags = true;
            failureMessages.push(parseResult.messages.join('\n'));
          }
          if (parseResult.tagsFound) {
            tagsFound = true;
          }
        } catch (err) {
          // Ignoring 404 errors.
          if (err.status === 404) {
            logger.info(
              `ignoring 404 errors upon fetching ${file}: ${err.message}`
            );
          }
          throw err;
        }
      }

      const checkParams = context.repo({
        name: 'Mismatched region tag',
        conclusion: 'success' as Conclusion,
        head_sha: context.payload.pull_request.head.sha,
        output: {
          title: 'Region tag check',
          summary: 'Region tag successful',
          text: 'Region tag successful',
        },
      });

      if (mismatchedTags) {
        checkParams.conclusion = 'failure';
        checkParams.output = {
          title: 'Mismatched region tag detected.',
          summary: 'Some new files have mismatched region tag',
          text: failureMessages.join('\n'),
        };
      }

      // post the status of commit linting to the PR, using:
      // https://developer.github.com/v3/checks/
      if (tagsFound) {
        await context.github.checks.create(checkParams);
      }

      if (result.changes.length === 0) {
        return;
      }

      // Add or update a comment on the PR.
      const prNumber = context.payload.pull_request.number;
      let commentBody = '';

      // First check product prefix for added region tags.
      const productPrefixViolations = await checkProductPrefixViolations(
        result,
        configuration
      );
      if (productPrefixViolations.length > 0) {
        commentBody += 'Here is the summary of possible violations 😱';
        let summary = '';
        if (productPrefixViolations.length === 1) {
          summary =
            'There is a possible violation for not having product prefix.';
        } else {
          summary = `There are ${productPrefixViolations.length} possible violations for not having product prefix.`;
        }
        let detail = '';
        for (const violation of productPrefixViolations) {
          detail += `- ${formatChangedFile(violation.change)}\n`;
        }
        commentBody += formatExpandable(summary, detail);
        commentBody += '---\n';
      }

      commentBody += 'Here is the summary of changes.\n';
      if (result.added > 0) {
        const plural = result.added === 1 ? '' : 's';
        const summary = `You added ${result.added} region tag${plural}.`;
        let detail = '';
        for (const change of result.changes) {
          if (change.type === 'add') {
            detail += `- ${formatChangedFile(change)}\n`;
          }
        }
        commentBody += formatExpandable(summary, detail);
      }
      if (result.deleted > 0) {
        const plural = result.deleted === 1 ? '' : 's';
        const summary = `You deleted ${result.deleted} region tag${plural}.\n`;
        let detail = '';
        for (const change of result.changes) {
          if (change.type === 'del') {
            detail += `- ${formatChangedFile(change)}\n`;
          }
        }
        commentBody += formatExpandable(summary, detail);
      }

      commentBody += `This comment is generated by [snippet-bot](https://github.com/apps/snippet-bot).
If you find problems with this result, please file an issue at:
https://github.com/googleapis/repo-automation-bots/issues.
To update this comment, add \`${REFRESH_LABEL}\` label.
`;

      const listCommentsResponse = await context.github.issues.listComments({
        owner: owner,
        repo: repo,
        per_page: 50,
        issue_number: prNumber,
      });
      let found = false;
      for (const comment of listCommentsResponse.data) {
        if (comment.body.includes(commentMark)) {
          // We found the existing comment, so updating it
          await context.github.issues.updateComment({
            owner: owner,
            repo: repo,
            comment_id: comment.id,
            body: `${commentMark}\n${commentBody}`,
          });
          found = true;
        }
      }
      if (!found) {
        await context.github.issues.createComment({
          owner: owner,
          repo: repo,
          issue_number: prNumber,
          body: `${commentMark}\n${commentBody}`,
        });
      }
    }
  );
};
