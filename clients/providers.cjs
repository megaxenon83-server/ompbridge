// API-key providers with built-in routing in Oh My Pi. Provider IDs are OMP IDs.
const nativeProviders = new Map([
  ['opencode-zen', 'OpenCode Zen'], ['opencode-go', 'OpenCode Go'],
  ['nvidia', 'NVIDIA'], ['openai', 'OpenAI'], ['anthropic', 'Anthropic'],
  ['google', 'Google Gemini'], ['openrouter', 'OpenRouter'], ['xai', 'xAI'],
  ['groq', 'Groq'], ['mistral', 'Mistral'], ['deepseek', 'DeepSeek'],
  ['cerebras', 'Cerebras'], ['fireworks', 'Fireworks AI'], ['together', 'Together AI'],
  ['huggingface', 'Hugging Face'], ['moonshot', 'Moonshot AI (Kimi)'],
  ['deepinfra', 'DeepInfra'], ['baseten', 'Baseten'], ['chutes', 'Chutes'],
  ['sambanova', 'SambaNova'], ['novita', 'Novita AI'], ['siliconflow', 'SiliconFlow'],
  ['siliconflow-cn', 'SiliconFlow China'], ['vercel-ai-gateway', 'Vercel AI Gateway'],
  ['zai', 'Z.AI Coding Plan'], ['zhipu-coding-plan', 'Zhipu Coding Plan'],
  ['gmi-cloud', 'GMI Cloud'], ['synthetic', 'Synthetic'], ['nanogpt', 'NanoGPT'],
  ['venice', 'Venice'], ['stepfun', 'StepFun'], ['xiaomi', 'Xiaomi MiMo'],
  ['minimax', 'MiniMax'], ['minimax-code', 'MiniMax Token Plan'],
  ['minimax-code-cn', 'MiniMax Token Plan China'], ['kilo', 'Kilo Gateway'],
  ['zenmux', 'ZenMux'], ['commandcode', 'Command Code'], ['charm-hyper', 'Charm Hyper'],
  ['abliteration', 'Abliteration'], ['aiand', 'ai&'], ['alibaba-token-plan', 'QwenCloud Token Plan'],
  ['coreweave', 'CoreWeave'], ['inception', 'Inception'], ['liquid', 'Liquid AI'],
  ['scaleway', 'Scaleway'], ['otari', 'Otari'], ['helmcode', 'Helmcode'],
  ['singularityapi-dev', 'SingularityAPI'], ['singularityapi-tech', 'SingularityAPI Reserved Lanes'],
  ['umans', 'Umans AI'], ['yolo-auto', 'Yolo-Auto']
]);

const accountPages = {
  'opencode-zen': 'https://opencode.ai/auth',
  'opencode-go': 'https://opencode.ai/auth'
};

function validateKey(value, required = true) {
  const key = typeof value === 'string' ? value.trim() : '';
  if ((required && !key) || /\s|[\x00-\x1f]/.test(key) || key.length > 8192) {
    throw new Error('Oppgi én gyldig API-nøkkel.');
  }
  return key;
}

function apiEndpoint(value) {
  const url = new URL(value);
  const local = ['localhost', '[::1]'].includes(url.hostname) ||
    /^(?:127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)\d+(?:\.\d+)*$/.test(url.hostname);
  if ((!local && url.protocol !== 'https:') || !['http:', 'https:'].includes(url.protocol) ||
      url.username || url.password || url.search || url.hash) {
    throw new Error('Bruk HTTPS eller en lokal HTTP-adresse uten påloggingsdetaljer i selve URL-en.');
  }
  return url;
}

async function discoverEndpoint(api, address, key) {
  const url = apiEndpoint(address);
  url.pathname = url.pathname.replace(/\/$/, '') + '/models';
  const headers = api === 'anthropic-messages'
    ? { 'anthropic-version': '2023-06-01', ...(key ? { 'x-api-key': key } : {}) }
    : { ...(key ? { Authorization: 'Bearer ' + key } : {}) };
  const response = await fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error('Modellendepunktet svarte med HTTP ' + response.status + '.');
  const data = await response.json();
  if (!Array.isArray(data.data)) throw new Error('Serveren svarte med et uventet modellformat.');
  return [...new Set(data.data.map(model => model.id).filter(id => typeof id === 'string' && id.trim()))];
}

module.exports = { nativeProviders, accountPages, validateKey, apiEndpoint, discoverEndpoint };
