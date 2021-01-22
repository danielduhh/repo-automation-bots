import * as Knex from 'knex';
import {logger} from 'gcf-utils';

type Events =
  | 'issues'
  | 'issue_comment'
  | 'pull_request'
  | 'pull_request_review'
  | 'pull_request_review_comment';

const getConfig = () => {
  // Configure which instance and what database user to connect with.
  // Remember - storing secrets in plaintext is potentially unsafe. Consider using
  // something like https://cloud.google.com/kms/ to help keep secrets secret.
  const config = {pool: {}} as any;

  // [START cloud_sql_postgres_knex_limit]
  // 'max' limits the total number of concurrent connections this pool will keep. Ideal
  // values for this setting are highly variable on app design, infrastructure, and database.
  config.pool.max = 5;
  // 'min' is the minimum number of idle connections Knex maintains in the pool.
  // Additional connections will be established to meet this value unless the pool is full.
  config.pool.min = 5;
  // [END cloud_sql_postgres_knex_limit]

  // [START cloud_sql_postgres_knex_timeout]
  // 'acquireTimeoutMillis' is the number of milliseconds before a timeout occurs when acquiring a
  // connection from the pool. This is slightly different from connectionTimeout, because acquiring
  // a pool connection does not always involve making a new connection, and may include multiple retries.
  // when making a connection
  config.pool.acquireTimeoutMillis = 60000; // 60 seconds
  // 'createTimeoutMillis` is the maximum number of milliseconds to wait trying to establish an
  // initial connection before retrying.
  // After acquireTimeoutMillis has passed, a timeout exception will be thrown.
  config.createTimeoutMillis = 30000; // 30 seconds
  // 'idleTimeoutMillis' is the number of milliseconds a connection must sit idle in the pool
  // and not be checked out before it is automatically closed.
  config.idleTimeoutMillis = 600000; // 10 minutes
  // [END cloud_sql_postgres_knex_timeout]

  // [START cloud_sql_postgres_knex_backoff]
  // 'knex' uses a built-in retry strategy which does not implement backoff.
  // 'createRetryIntervalMillis' is how long to idle after failed connection creation before trying again
  config.createRetryIntervalMillis = 200; // 0.2 seconds
  // [END cloud_sql_postgres_knex_backoff]

  return config;
};

export const getSpaceFromEvent = async (
  db: Knex,
  event_name: string,
  repo_name: string
) => {
  try {
    // SELECT space.name as "space_name"
    // FROM subscription s, space, event e, repository r
    // WHERE s.space_id = space.id
    // AND s.event_id = e.id
    // AND s.repository_id = r.id
    // AND e.name = event_name
    // AND r.name = repo_name
    const space = await db('subscription')
      .join('space', 'subscription.space_id', 'space.id')
      .join('event', 'subscription.event_id', 'event.id')
      .join('repository', 'subscription.repository_id', 'repository.id')
      .select('space.name')
      .where('event.name', event_name)
      .andWhere('repository.name', repo_name)
      .returning('space.name');

    return space;
  } catch (error) {
    console.log(error);
    return Promise.reject(error);
  }
};

export const getSpace = async (db: Knex, space_name: string, active = true) => {
  try {
    const space = await db('space')
      .returning(['id', 'name'])
      .insert({
        name: space_name,
        active: active,
        date_created: new Date().toDateString(),
      })
      .onConflict('name')
      .merge();

    console.log(space);

    return space[0];
  } catch (error) {
    console.log(error);
    return Promise.reject(error);
  }
};

export const deactivateSpace = async (db: Knex, name: string) => {
  try {
    const space: any[] = await db('space')
      .where({
        name: name,
      })
      .returning(['id', 'name', 'active'])
      .update({
        active: false,
      });

    // Remove all subscriptions associated with space.
    const subscriptions = await db('subscription')
      .where({
        space_id: space[0].id,
      })
      .delete();

    if (space.length > 0) {
      logger.info(
        `Successfully updated space: ${space} and removed related subscriptions.`
      );
    }

    return space;
  } catch (error) {
    logger.error(`Failed to update space ${name}.`);
    logger.error(error);
    return Promise.reject(error);
  }
};

export const createSubscription = async (
  db: Knex,
  space_name: string,
  repo_name: string,
  events: Events[]
) => {
  // 1. Get the repository id
  // 1. Get the event id
  logger.info(
    `Creating subscription for: space: ${space_name}, repo: ${repo_name}, events: ${events.join(
      ', '
    )}`
  );

  try {
    const subscriptions = Promise.all(
      events.map(async event_name => {
        const repository = await getRepository(db, repo_name);
        const event = await getEvent(db, event_name);
        const space = await getSpace(db, space_name);

        return db('subscription')
          .returning('id')
          .insert({
            repository_id: repository.id,
            space_id: space.id,
            event_id: event.id,
          })
          .onConflict(['repository_id', 'space_id', 'event_id'])
          .ignore();
      })
    );

    return subscriptions;
  } catch (error) {
    logger.error('Failed to create subscription');
    logger.error(error);
    return Promise.reject(error);
  }
};

export const removeSubscription = async (
  db: Knex,
  space_name: string,
  repo_name: string,
  event_name: Events
) => {
  try {
    const repository = await getRepository(db, repo_name);
    const event = await getEvent(db, event_name);
    const space = await getSpace(db, space_name);

    const subscription = await db('subscription')
      .where({
        repository_id: repository.id,
        space_id: space.id,
        event_id: event.id,
      })
      .delete();

    logger.info(
      `Unsubscribing ${space_name} from ${subscription} subscriptions (${repo_name} ${event_name}).`
    );

    return subscription;
  } catch (error) {
    logger.error(
      `Failed to delete ${event_name} subscription for ${repo_name}.`
    );
    logger.error(error);
    return Promise.reject(error);
  }
};

const getRepository = async (db: Knex, name: string) => {
  try {
    const repository = await db('repository')
      .returning(['id', 'name'])
      .insert({
        name: name,
      })
      .onConflict('name')
      .merge();

    return repository[0];
  } catch (error) {
    console.log(error);
    return Promise.reject(error);
  }
};

const getEvent = async (db: Knex, name: string) => {
  try {
    const event = await db('event').where('name', name).select('id');

    return event[0];
  } catch (error) {
    console.log(error);
    return Promise.reject(error);
  }
};

export class Datastore {
  private static instance: Knex;

  private constructor() {}

  public static getInstance() {
    if (!Datastore.instance) {
      Datastore.init();
    }

    return Datastore.instance;
  }

  private static init() {
    let instance: Knex;

    if (process.env.DB_HOST) {
      instance = Knex({
        client: 'pg',
        connection: {
          user: process.env.DB_USER, // e.g. 'my-user'
          password: process.env.DB_PASS, // e.g. 'my-user-password'
          database: process.env.DB_NAME, // e.g. 'my-database'
          host: process.env.DB_HOST, // e.g. '127.0.0.1'
          port: process.env.DB_PORT, // e.g. '5432'
        },
        // ... Specify additional properties here.
        ...getConfig(),
      });
    } else {
      const dbSocketPath = process.env.DB_SOCKET_PATH || '/cloudsql';
      instance = Knex({
        client: 'pg',
        connection: {
          user: process.env.DB_USER, // e.g. 'my-user'
          password: process.env.DB_PASS, // e.g. 'my-user-password'
          database: process.env.DB_NAME, // e.g. 'my-database'
          host: `${dbSocketPath}/${process.env.CLOUD_SQL_CONNECTION_NAME}`,
        },
        // ... Specify additional properties here.
        ...getConfig(),
      });
    }

    Datastore.instance = instance;

    //TODO run a sanity check that we have the connection
  }
}
