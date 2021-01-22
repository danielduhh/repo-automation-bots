import {Request, Response} from 'express';
import {getChatClient} from './utils';
import {
  createSubscription,
  Datastore,
  getSpace,
  removeSubscription,
  deactivateSpace,
} from './datastore';
import * as Knex from 'knex';
import {logger} from 'gcf-utils';

const bot = async (req: Request, res: Response) => {
  // TODO add security to ensure request is coming from CHAT API Client
  const CHAT_CLIENT = await getChatClient();
  const {
    type,
    space: {name, displayName},
    user,
  } = req.body;
  const database: Knex = Datastore.getInstance();

  logger.info(`Handling /bot request: ${type}`);
  logger.info(req.body);

  try {
    switch (type) {
      case 'ADDED_TO_SPACE':
        {
          const space: any = await getSpace(database, name);
          const response = await CHAT_CLIENT.spaces.messages.create({
            parent: name,
            threadKey: '',
            //TODO Add message (and link) to warn user they must grant the chatbot app permissions to their repo
            requestBody: {
              text: `Thank you ${user.displayName} for adding the ${displayName} channel to GitHangout bot.`,
            },
          });

          res.send().status(200);
        }
        break;
      case 'MESSAGE':
        {
          const response = await handleSlashCommand(database, req.body);
          res.send(response);
        }
        break;
      case 'REMOVED_FROM_SPACE':
        {
          const response = await handleRemoveFromSpace(database, req.body);
          res.sendStatus(200);
        }
        break;
    }
  } catch (error) {
    logger.error(`Failed to process ${type}: ${error.message}`);
    logger.error(error);
    res.send({
      text: 'Failed to process command. See /help for a list of commands.',
    });
  }
};

const handleRemoveFromSpace = async (database: Knex, body: any) => {
  const {
    space: {name},
  } = body;

  return await deactivateSpace(database, name);
};

const handleSlashCommand = async (db: Knex, body: any) => {
  const {
    space: {name, displayName},
    message: {
      text,
      argumentText,
      annotations,
      slashCommand,
      slashCommand: {commandId},
    },
  } = body;
  logger.info(`Handling slash command: ${commandId}`);

  if (slashCommand) {
    switch (commandId) {
      case '1': {
        const trimmedText = argumentText.trim().split(' ');
        // subscribe
        const repository = trimmedText[0];
        // TODO handle multiple events
        const events = trimmedText.slice(1, trimmedText.length);
        const subscription = await createSubscription(
          db,
          name,
          repository,
          events
        );

        return {
          text: `Successfully subscribed to ${repository} ${events.join(
            ', '
          )} events.`,
        };
      }
      case '2': {
        //unsubscribe
        const repository = argumentText.trim().split(' ')[0];
        const event = argumentText.trim().split(' ')[1];

        const subscription = await removeSubscription(
          db,
          name,
          repository,
          event
        );

        const message =
          subscription > 0
            ? `Unsubscribed from ${repository} ${event} events.`
            : 'Subscription does not exist.';

        return {
          text: message,
        };
      }
      case '3': {
        // help
        return {
          text:
            "*/subscribe* [repo] [event] - Subscribe to a github repo's event." +
            '\nRepo must be in the following format: org/repo (i.e. googleapis/nodejs-storage)' +
            '\nValid events: pull_request, issues, issue_comment' +
            '\nExample usage `/subscribe googleapis/nodejs-storage issues`' +
            'Your pizza delivery *has arrived*!\nThank you for using _Pizza Bot!_',
        };
      }
    }
  }

  return {
    text:
      'Invalid slashCommand. Supported commands: /subscribe [org/repo] [event], /unsubscribe [org/repo] [event]',
  };
};

export default bot;
