
-- Enums
CREATE TYPE public.app_role AS ENUM ('vendedor', 'gestor');
CREATE TYPE public.user_status AS ENUM ('online', 'busy', 'away', 'offline');
CREATE TYPE public.conv_label AS ENUM ('hot', 'warm', 'cold', 'new', 'closed');
CREATE TYPE public.conv_status AS ENUM ('aguardando', 'em_atendimento', 'encerrada');
CREATE TYPE public.msg_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE public.msg_type AS ENUM ('text', 'audio', 'image', 'document', 'template');
CREATE TYPE public.msg_status AS ENUM ('sent', 'delivered', 'read', 'failed');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  avatar_url TEXT,
  status public.user_status NOT NULL DEFAULT 'offline',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles (separate table to avoid privilege escalation)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check role (avoids recursive RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Conversations
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_contact_id TEXT,
  contact_name TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  contact_avatar TEXT,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  label public.conv_label NOT NULL DEFAULT 'new',
  status public.conv_status NOT NULL DEFAULT 'aguardando',
  last_message TEXT,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unread_count INT NOT NULL DEFAULT 0,
  crm_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE INDEX conversations_assigned_idx ON public.conversations(assigned_to);
CREATE INDEX conversations_last_msg_idx ON public.conversations(last_message_at DESC);

-- Messages
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  wamid TEXT,
  direction public.msg_direction NOT NULL,
  type public.msg_type NOT NULL DEFAULT 'text',
  content TEXT,
  media_url TEXT,
  status public.msg_status NOT NULL DEFAULT 'sent',
  sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX messages_conv_idx ON public.messages(conversation_id, created_at);

-- RLS: profiles
CREATE POLICY "Profiles viewable by authenticated"
  ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users insert own profile"
  ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- RLS: user_roles (read only for authenticated; writes via admin)
CREATE POLICY "Roles viewable by authenticated"
  ON public.user_roles FOR SELECT TO authenticated USING (true);

-- RLS: conversations
CREATE POLICY "Vendedor sees own, gestor sees all (select)"
  ON public.conversations FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'gestor')
    OR assigned_to = auth.uid()
  );
CREATE POLICY "Vendedor updates own, gestor updates all"
  ON public.conversations FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'gestor')
    OR assigned_to = auth.uid()
  );
CREATE POLICY "Gestor inserts conversations"
  ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'gestor') OR assigned_to = auth.uid());

-- RLS: messages
CREATE POLICY "Messages select via conversation access"
  ON public.messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (public.has_role(auth.uid(), 'gestor') OR c.assigned_to = auth.uid())
    )
  );
CREATE POLICY "Messages insert via conversation access"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (public.has_role(auth.uid(), 'gestor') OR c.assigned_to = auth.uid())
    )
  );

-- Trigger: auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  -- default role: vendedor
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'vendedor');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger: bump conversation last_message on new message
CREATE OR REPLACE FUNCTION public.bump_conversation()
RETURNS TRIGGER
LANGUAGE PLPGSQL
AS $$
BEGIN
  UPDATE public.conversations
    SET last_message = COALESCE(NEW.content, '[mídia]'),
        last_message_at = NEW.created_at,
        unread_count = CASE WHEN NEW.direction = 'inbound' THEN unread_count + 1 ELSE unread_count END
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_message_insert
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_conversation();

-- Realtime
ALTER TABLE public.conversations REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
