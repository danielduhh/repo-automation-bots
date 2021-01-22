// Copyright 2019 Google LLC
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

import {logger} from 'gcf-utils';
import {Probot} from 'probot';
import {
  createColorText,
  createGithubButton,
  getCardHeader,
  getChatClient,
  truncateText,
} from './utils';
import {Datastore, getSpaceFromEvent} from './datastore';
import Knex from 'knex';

const handler = (app: Probot) => {
  app.on(['issues.opened', 'issue_comment'], async (context: any) => {
    const database: Knex = Datastore.getInstance();

    const {payload, name} = context;
    const {repository, issue, action, comment} = payload;
    const issueType = payload.issue.pull_request ? 'Pull Request' : 'Issue';

    const labels =
      action === 'opened'
        ? issue.labels
            .map((label: any) => createColorText(label.color, label.name))
            .join(', ')
        : '';
    const header =
      action === 'opened'
        ? getCardHeader(
            name,
            `${repository.full_name}, #${payload.issue.number}`
          )
        : getCardHeader(
            name,
            `${repository.full_name}, ${issueType}: #${payload.issue.number}`
          );
    const paragraph =
      action === 'opened'
        ? `<b>${issue.title}</b>\n${truncateText(issue.body, 150)}\n${labels}`
        : `<b>Comment from: ${comment.user.login}</b>\n${truncateText(
            comment.body,
            250
          )}`;
    const actionUrl = action === 'opened' ? issue.html_url : comment.html_url;

    const card: any = {
      cards: [
        {
          header: header,
          sections: [
            {
              widgets: [
                {
                  textParagraph: {
                    text: paragraph,
                  },
                },
              ],
            },
            {
              widgets: [
                {
                  buttons: [createGithubButton(actionUrl)],
                },
              ],
            },
          ],
        },
      ],
    };

    try {
      // Check if we have subscriptions for incoming repository and event
      const spaces = await getSpaceFromEvent(
        database,
        name,
        repository.full_name
      );
      // If we have more than one space, continue, else return nothing
      if (spaces.length > 0) {
        const CHAT_CLIENT = await getChatClient();
        const response = await Promise.all(
          spaces.map(async space => {
            return await CHAT_CLIENT.spaces.messages.create({
              parent: space.name,
              threadKey: payload.issue.node_id,
              requestBody: card,
            });
          })
        );

        logger.info(
          `Successfully delivered events to ${spaces
            .map(space => space.name)
            .join(', ')} from: ${repository.full_name}. Status: ${response.map(
            r => r.status
          )}`
        );
      } else {
        logger.info(
          `No registered spaces for event: ${name}, repo: ${repository.full_name}`
        );
      }
    } catch (error) {
      logger.error(
        `Failed to process event: ${context.name} from ${repository.full_name}. Error: ${error.message}`,
        error
      );
      logger.error(error);
    }

    return;
  });

  app.on(['pull_request.opened'], async (context: any) => {
    const database: Knex = Datastore.getInstance();

    const {payload, name} = context;
    const {repository, pull_request} = payload;
    const labels = pull_request.labels
      .map((label: any) => createColorText(label.color, label.name))
      .join(', ');

    const card = {
      cards: [
        {
          header: getCardHeader(
            name,
            `${repository.full_name}, #${payload.number}`
          ),
          sections: [
            {
              widgets: [
                {
                  textParagraph: {
                    text: `<b>${pull_request.title}</b>\n${truncateText(
                      pull_request.body,
                      150
                    )}\n${labels}`,
                  },
                },
              ],
            },
            {
              widgets: [
                {
                  buttons: [createGithubButton(pull_request.html_url)],
                },
              ],
            },
          ],
        },
      ],
    };

    try {
      // Check if we have subscriptions for incoming repository and event
      const spaces = await getSpaceFromEvent(
        database,
        name,
        repository.full_name
      );
      // If we have more than one space, continue, else return nothing
      if (spaces.length > 0) {
        const CHAT_CLIENT = await getChatClient();
        const response = await Promise.all(
          spaces.map(async space => {
            return await CHAT_CLIENT.spaces.messages.create({
              parent: space.name,
              threadKey: pull_request.node_id,
              requestBody: card,
            });
          })
        );

        logger.info(
          `Successfully delivered events to ${spaces
            .map(space => space.name)
            .join(', ')} from: ${repository.full_name}. Status: ${response.map(
            r => r.status
          )}`
        );
      } else {
        logger.info(
          `No registered spaces for event: ${name}, repo: ${repository.full_name}`
        );
      }
    } catch (error) {
      logger.error(
        `Failed to process event: ${context.name} from ${repository.full_name}. Error: ${error.message}`,
        error
      );
      logger.error(error);
    }

    return;
  });
};

export default handler;
