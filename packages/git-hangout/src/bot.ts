import {Request, Response, Router} from 'express';
import {getChatClient} from './utils';

export const router = Router()

router.post('/bot', async (req: Request, res: Response) => {

  const CHAT_CLIENT = await getChatClient();
  const {type, space: {name, displayName}} = req.body

  switch (type) {
    case 'ADDED_TO_SPACE':

      try {

        //TODO add space name to datastore
        const response = await CHAT_CLIENT.spaces.messages.create({
          parent: name,
          threadKey: '',
          requestBody: {text: `Thank you ${displayName} for adding the GitHangout bot.`}
        })

        res.send().status(200);
      } catch (error) {
        res.send({error: error.message}).status(500)
      }


      break;
    case 'MESSAGE':
      res.send(handleSlashCommand(req.body));
      break;
    case 'CARD_CLICKED':
      res.send(handleAddToSpace(req.body));
      break;
  }
});

const handleAddToSpace = (body:any) => {
  return {
    'text': JSON.stringify(body)
  }
}

const handleSlashCommand = (body:any) => {
  const {message: {text, argumentText, annotations, slashCommand, slashCommand: {commandId}}} = body;

  if (slashCommand) {
    switch(commandId) {
      case 1: // subscribe
        // TODO sanitize and save argumentText to datastore ?

    }
  }

}
