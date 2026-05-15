
CREATE INDEX IF NOT EXISTS messages_conv_created_idx
  ON public.messages (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS conversations_account_last_idx
  ON public.conversations (account_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS conversations_assigned_idx
  ON public.conversations (assigned_to)
  WHERE assigned_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS conversation_tags_conv_idx
  ON public.conversation_tags (conversation_id);

CREATE INDEX IF NOT EXISTS conversation_tags_tag_idx
  ON public.conversation_tags (tag_id);

CREATE INDEX IF NOT EXISTS contacts_phone_idx
  ON public.contacts (phone);

-- Debounce do bump_conversation: ignora updates redundantes em rajada
CREATE OR REPLACE FUNCTION public.bump_conversation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  current_last timestamptz;
BEGIN
  SELECT last_message_at INTO current_last
    FROM public.conversations
    WHERE id = NEW.conversation_id;

  -- Se a conversa já tem um last_message_at >= NEW.created_at, e a diferença
  -- é menor que 2s, e a mensagem é outbound (não muda unread), pula o update.
  IF current_last IS NOT NULL
     AND NEW.direction = 'outbound'
     AND current_last >= NEW.created_at - interval '2 seconds'
     AND current_last <= NEW.created_at THEN
    RETURN NEW;
  END IF;

  UPDATE public.conversations
    SET last_message = COALESCE(NEW.content, '[mídia]'),
        last_message_at = NEW.created_at,
        unread_count = CASE WHEN NEW.direction = 'inbound' THEN unread_count + 1 ELSE unread_count END
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$function$;
