-- FASE 2: Roles Admin / Gestor / Comercial / CS

-- 1) Adicionar novos valores ao enum app_role (vendedor mantém-se por compat)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'comercial';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'cs';