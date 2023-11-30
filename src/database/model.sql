create database aksiyabot;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

drop table if exists users cascade;
create table if not exists users(
    user_id uuid default uuid_generate_v4() primary key,
    user_tg_name varchar(70),
    user_tg_username varchar(32),
    user_tg_id varchar(45) not null,
    user_tg_step smallint default 1,
    user_phone_number text,
    user_created_at timestamp with time zone default current_timestamp
);

drop table if exists activation_codes cascade;
create table activation_codes(
    ac_id uuid default uuid_generate_v4() primary key,
    ac_code text not null,
    user_id uuid not null references users(user_id),
    ac_createdat timestamp with time zone default current_timestamp
);

drop table if exists contacts cascade;
create table contacts(
    contract_id uuid default uuid_generate_v4() primary key,
    contract_number text not null,
    contract_phone_number text not null,
    contract_type text not null,
    contract_count text not null,
    contract_createdat timestamp with time zone default current_timestamp
);

drop table if exists eskiztoken cascade;
create table eskiztoken(
    token_id uuid default uuid_generate_v4() primary key,
    token_token text not null,
    token_createdat timestamp with time zone default current_timestamp
);