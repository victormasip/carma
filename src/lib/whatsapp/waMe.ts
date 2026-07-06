// Client-safe wa.me link builder, shared by every surface that receives the
// agent number as DATA (AgentConnection, ConnectAgentStep). Server code that
// reads WA_AGENT_NUMBER from the env keeps using config.ts's agentWaMeLink.
export function waMeLink(number: string, prefill?: string): string | null {
  const digits = number.replace(/[^\d]/g, '')
  if (!digits) return null
  return prefill ? `https://wa.me/${digits}?text=${encodeURIComponent(prefill)}` : `https://wa.me/${digits}`
}
