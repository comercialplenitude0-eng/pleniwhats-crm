
DROP TRIGGER IF EXISTS trg_log_conversation_changes ON public.conversations;
CREATE TRIGGER trg_log_conversation_changes
AFTER UPDATE ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.log_conversation_changes();

DROP TRIGGER IF EXISTS trg_log_note_created ON public.conversation_notes;
CREATE TRIGGER trg_log_note_created
AFTER INSERT ON public.conversation_notes
FOR EACH ROW EXECUTE FUNCTION public.log_note_created();

DROP TRIGGER IF EXISTS trg_log_tag_change ON public.conversation_tags;
CREATE TRIGGER trg_log_tag_change
AFTER INSERT OR DELETE ON public.conversation_tags
FOR EACH ROW EXECUTE FUNCTION public.log_tag_change();
