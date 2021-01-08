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

import axios from 'axios';
import * as express from 'express'
import {logger} from 'gcf-utils';
import {ApplicationFunctionOptions, Probot} from 'probot';
import {
  createColorText,
  createGithubButton,
  getCardHeader,
  truncateText,
} from './utils';
import {router as bot} from './bot'
import * as cors from 'cors';

const CONFIGURATION_FILE_PATH = 'git-hangout.yml';

interface Configuration {
  CHAT_WEBHOOK_URL?: string;
}

export default function handler(app: Probot, {getRouter}: ApplicationFunctionOptions) {

  // @ts-ignore
  const router = getRouter("git-hangout");
  router.use(express.json())
  router.use(cors({}))
  router.use(bot)

  app.on(['issues.opened', 'issue_comment'], async (context: any) => {
    let config: Configuration = {};
    // TODO remove configuration (token is no longer needed)
    // TODO look up all chatrooms that match the incoming event and send message
    try {
      config = (await context.config(
        CONFIGURATION_FILE_PATH
      )) as Configuration;

      if (!config.CHAT_WEBHOOK_URL) {
        logger.error(`Missing configuration ${config}`)
        return
      }
    } catch (error) {
      logger.error(`Error reading configuration: ${error.message}`);
      logger.error(error);

      return;
    }

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
        ? getCardHeader(name, `${repository.full_name}, #${
              payload.issue.number
          }`)
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
                  buttons: [
                      createGithubButton(actionUrl)
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    try {
      const response = await axios.post(
        `${config.CHAT_WEBHOOK_URL}&threadKey=${payload.issue.node_id}`,
        card
      );
      logger.info(
        `Successfully processed: ${context.name} event from: ${repository.full_name}. Status: ${response.status}`
      );
    } catch (error) {
      logger.error(
        `Failed to process event: ${context.name} from ${repository.full_name}. Error: ${error.message}. URI: ${config.CHAT_WEBHOOK_URL}&threadKey=${issue.node_id}`,
        error
      );
      logger.error(error);
    }

    return;
  });

  app.on(['pull_request.opened'], async (context: any) => {
    let config: Configuration = {};
    try {
      config = (await context.config(
          CONFIGURATION_FILE_PATH
      )) as Configuration;

      if (!config.CHAT_WEBHOOK_URL) {
        logger.error(`Missing configuration ${config}`)
        return
      }
    } catch (error) {
      logger.error(`Error reading configuration: ${error.message}`);
      logger.error(error);

      return;
    }

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
                  buttons: [
                    createGithubButton(pull_request.html_url)
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    try {
      const response = await axios.post(
        `${config.CHAT_WEBHOOK_URL}&threadKey=${pull_request.node_id}`,
        card
      );
      logger.info(
        `Successfully processed: ${context.name} event from: ${repository.full_name}. Status: ${response.status}`
      );
    } catch (error) {
      logger.error(
        `Failed to process event: ${context.name} from ${repository.full_name}. Error: ${error.message}. URI: ${config.CHAT_WEBHOOK_URL}&threadKey=${pull_request.node_id}`,
        error
      );
      logger.error(error);
    }

    return;
  });
}
