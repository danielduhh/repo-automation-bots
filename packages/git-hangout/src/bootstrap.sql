CREATE TABLE IF NOT EXISTS space (
 id serial primary key,
 name character varying not null unique,
 active boolean not null default true,
 date_created timestamp without time zone
);

CREATE TABLE IF NOT EXISTS event (
 id serial primary key,
 name character varying not null unique
);

CREATE TABLE IF NOT EXISTS repository (
 id serial primary key,
 name character varying not null unique
);

CREATE TABLE IF NOT EXISTS subscription (
 id serial not null,
 repository_id serial not null references repository(id),
 space_id serial not null references space(id),
 event_id serial not null references event(id),
 primary key (repository_id, space_id, event_id)
);

INSERT INTO event (name) values ('issues');
INSERT INTO event (name) values ('issue_comment');
INSERT INTO event (name) values ('pull_request');
INSERT INTO event (name) values ('pull_request_review');
INSERT INTO event (name) values ('pull_request_review_comment');

