export default function filterTools(pi) {
  const disabled = new Set(JSON.parse(process.env.OMP_DESKTOP_DISABLED_TOOLS || '[]'));
  const apply = () => {
    const active = pi.getActiveTools();
    const selected = active.filter(name => !disabled.has(name));
    if (selected.length !== active.length) pi.setActiveTools(selected);
  };

  pi.on('session_start', apply);
  // OMP can refresh the tool registry after an MCP server connects.
  pi.on('before_agent_start', apply);
  pi.on('tool_call', event => {
    if (disabled.has(event.toolName)) return { block: true, reason: 'Deaktivert i OMP Desktop.' };
  });
}
