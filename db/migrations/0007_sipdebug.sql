-- SIP debug: el analizador en vivo (tipo sngrep) que ya teniamos en PBX-NG.
-- Es un anillo: el sniffer poda solo, nunca crece sin limite.
CREATE TABLE IF NOT EXISTS sbc_sip_capture (
  id        bigserial PRIMARY KEY,
  ts        timestamptz DEFAULT now(),
  src       text,
  dst       text,
  method    text,
  status    int,
  callid    text,
  cseq      text,
  from_uri  text,
  to_uri    text,
  ruri      text,
  raw       text
);
CREATE INDEX IF NOT EXISTS sbc_sip_capture_callid_idx ON sbc_sip_capture (callid);
CREATE INDEX IF NOT EXISTS sbc_sip_capture_ts_idx ON sbc_sip_capture (ts DESC);
