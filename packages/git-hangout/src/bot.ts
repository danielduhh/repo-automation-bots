import {Request, Response} from 'express';
import {getChatClient} from './utils';
import {createSubscription, Datastore, getSpace} from './datastore';
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

  switch (type) {
    case 'ADDED_TO_SPACE':
      try {
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
      } catch (error) {
        // TODO Set record inactive if chat client fails
        res.send({error: error.message}).status(500);
      }

      break;
    case 'MESSAGE':
      try {
        const response = await handleSlashCommand(database, req.body);

        res.send(response);
      } catch (error) {
        res.send({error: error.message}).status(500);
      }
      break;
    case 'CARD_CLICKED':
      res.send(handleAddToSpace(req.body));
      break;
  }
};

const handleAddToSpace = (body: any) => {
  return {
    text: JSON.stringify(body),
  };
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
        // subscribe
        const repository = argumentText.trim().split(' ')[0];
        const event = argumentText.trim().split(' ')[1];
        // TODO add try catch here and send an error message if ^^ doesnt exist
        const subscription = await createSubscription(
          db,
          name,
          repository,
          event
        );

        return {
          text: `Successfully subscribed to ${repository} ${event} events.`,
        };
      }
    }
  }

  return {
    text:
      'Invalid slashCommand. Supported commands: /subscribe [org/repo] [event]',
  };
};

export default bot;
