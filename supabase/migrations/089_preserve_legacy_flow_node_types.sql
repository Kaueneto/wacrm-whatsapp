-- Preserve the legacy HTTP node accepted by earlier schemas alongside the AI node.
ALTER TABLE public.flow_nodes DROP CONSTRAINT flow_nodes_node_type_check;
ALTER TABLE public.flow_nodes ADD CONSTRAINT flow_nodes_node_type_check CHECK (node_type IN (
  'start','send_message','send_buttons','send_list','send_media','collect_input','condition','set_tag','handoff','http_fetch','ai_assistant','end'
));
