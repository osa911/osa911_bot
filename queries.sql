create table "public"."Users" (
  id numeric primary key not null,
  is_bot boolean,
  first_name varchar(255),
  username varchar(255),
  language_code varchar(255),
  chatId numeric,
  request_count numeric
);

create table "public"."Xrp" (
  id uuid default uuid_generate_v4() primary key,
  price numeric(10,6)
);
