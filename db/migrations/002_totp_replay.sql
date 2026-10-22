-- Último passo TOTP aceito: um código já usado (mesmo dentro da janela de ±30 s) não vale de novo.
alter table app_user add column if not exists totp_last_counter bigint;
