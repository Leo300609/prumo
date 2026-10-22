-- Marca tentativas em que e-mail e senha estavam certos (só o código falhou): base do limite
-- por conta, que vale para qualquer IP e só é atingido por quem já sabe a senha.
alter table login_attempt add column if not exists pw_ok boolean not null default false;
