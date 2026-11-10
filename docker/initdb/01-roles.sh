#!/bin/bash
# Runs once, when the data volume is first created.
#
#   wtp_owner  owns the database and every table. Used ONLY by migrations and seed scripts.
#   wtp_auth   used ONLY by the auth layer (Better Auth). It can reach the four auth
#              tables (users, sessions, accounts, verifications) and nothing else.
#   wtp_app    the role the Next.js app connects with. Not a superuser, no BYPASSRLS,
#              owns nothing, so row-level security always applies to it.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<SQL
CREATE ROLE wtp_owner LOGIN PASSWORD '${DB_OWNER_PASSWORD}'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE wtp_app LOGIN PASSWORD '${DB_APP_PASSWORD}'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE wtp_auth LOGIN PASSWORD '${DB_AUTH_PASSWORD}'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE DATABASE ${APP_DB_NAME} OWNER wtp_owner;
REVOKE ALL ON DATABASE ${APP_DB_NAME} FROM PUBLIC;
GRANT CONNECT ON DATABASE ${APP_DB_NAME} TO wtp_app, wtp_auth;
SQL
