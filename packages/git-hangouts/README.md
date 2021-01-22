# git-hangouts

git Hangouts is a Github x Google Chat integration that allows users to
add webhook event subscriptions to specific chat rooms.

## Usage

Add the [git-hangouts Application](https://github.com/apps/git-hangouts) to your Github repository.

Add the git Hangouts bot (only available to those with a cloudadvocacyorg account) 
to your Google Chat room or direct message. Upon adding the bot, the following 
slash commands will be available.


![Slash Commands](/packages/git-hangouts/docs/slash-commands.png)

| command            | args |  description | example
|-------------------|----------|-------------|-------------------------------------|
| `/help`         | none |  Sends a description and example of supported commands  | `/help`
| `/subscribe`    | `[org/repo] [events...]` | Subscribe to an event.  | `/subscribe googleapis/nodejs-storage issues issue_comment`
| `/unsubscribe`  | `[org/repo] [events...]` | Unsubscribe from an event. | `/ubsubscribe googleapis/nodejs-storage pull_request`


The following card will be delivered to all subscribed chat rooms:

![Example Card](/packages/git-hangouts/docs/example-card.png)

## Design

* [Probot](https://probot.github.io/)
* [Google Chat API](https://developers.google.com/hangouts/chat/concepts)
* [Cloud SQL (postgresql)](https://cloud.google.com/sql/docs/postgres/quickstart)

#### Probot
Probot creates and manages the [git-hangouts GitHub application](https://github.com/apps/git-hangouts), 
which includes client authentication for receiving webhooks events. ⚠️ Users must 
grant the git-hangouts application access their repository to enable the integration.

Currently supported events:
 1. [issues](https://docs.github.com/en/developers/webhooks-and-events/webhook-events-and-payloads#issues) - Activity related to an issue.
 2. [issue_comment](https://docs.github.com/en/developers/webhooks-and-events/webhook-events-and-payloads#issue_comment) - Activity related to an issue comment.
 3. [pull_request](https://docs.github.com/en/developers/webhooks-and-events/webhook-events-and-payloads#pull_request) - Activity related to pull requests.
 

#### Google Chat API Bot 
The Chat API bot responds synchronously and asynchronously to events triggered in-channel
and through the Probot client.

#### Postgres on Cloud SQL
We use a small datastore to keep track of user registered repositories, events, and channels.

| table            | primary key |  description
|-------------------|----------|--------------------------------------------------|
| space           | id   |  Generalization of chat rooms and direct messages. Each space has a google generated unique id (e.g `spaces/AAAAzY_aki8`).  |
| event           |   id | Name of github event. Stored as `X-GitHub-Event` header in webhook payload. |
| repository      |   id  | Description here |
| subscription    |  space_id, event_id, repository_id  | Description here |

## Running tests:

`npm test`

## Contributing

If you have suggestions for how git-hangout could be improved, or want to report a bug, open an issue! We'd love all and any contributions.

For more, check out the Contributing Guide.

License
Apache 2.0 © 2019 Google LLC.