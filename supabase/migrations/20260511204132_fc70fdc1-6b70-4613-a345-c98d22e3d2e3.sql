
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-media', 'chat-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "chat-media public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'chat-media');

CREATE POLICY "chat-media auth insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'chat-media');

CREATE POLICY "chat-media owner update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'chat-media' AND owner = auth.uid());

CREATE POLICY "chat-media owner delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'chat-media' AND owner = auth.uid());
