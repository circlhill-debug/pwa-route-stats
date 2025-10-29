// AI summary feature: token usage, collapse state, Supabase sync, OpenAI calls.
import { todayIso } from '../utils/date.js';
import {
  AI_LAST_SUMMARY_KEY,
  AI_SUMMARY_COLLAPSED_KEY,
  loadTokenUsage,
  saveTokenUsage,
  getOpenAiKey,
  getAiBasePrompt
} from '../utils/storage.js';

function loadLastSummary(){
  try{
    const raw = localStorage.getItem(AI_LAST_SUMMARY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  }catch(_){
    return null;
  }
}

function saveLastSummary(summary){
  try{
    if (summary){
      localStorage.setItem(AI_LAST_SUMMARY_KEY, JSON.stringify(summary));
    }else{
      localStorage.removeItem(AI_LAST_SUMMARY_KEY);
    }
    return true;
  }catch(err){
    console.error('[AI summary] failed to persist', err);
    return false;
  }
}

function isCollapsed(){
  try{
    return localStorage.getItem(AI_SUMMARY_COLLAPSED_KEY) === '1';
  }catch(_){
    return false;
  }
}

function saveCollapsed(flag){
  try{
    localStorage.setItem(AI_SUMMARY_COLLAPSED_KEY, flag ? '1' : '0');
  }catch(_){ /* noop */ }
}

export function createAiSummary({
  elements,
  supabaseClient,
  getCurrentUserId,
  getDiagnosticsContext,
  defaultPrompt,
  onTokenUsageChange
}){
  const {
    card,
    button,
    toggleButton,
    hint,
    status,
    output,
    content,
    tokenUsageCard,
    tokenTodayEl,
    tokenWeekEl,
    tokenMonthEl,
    tokenLimitEl,
    tokenBarFill,
    tokenBarNote,
    tokenTodayInput,
    tokenWeekInput,
    tokenMonthInput,
    tokenLimitInput
  } = elements;

  const promptFallback = defaultPrompt || 'Provide an upbeat summary.';

  function applyCollapsed(force){
    const collapsed = typeof force === 'boolean' ? force : isCollapsed();
    if (content) content.style.display = collapsed ? 'none' : 'block';
    if (toggleButton) toggleButton.textContent = collapsed ? 'Expand' : 'Collapse';
  }

  function setCollapsed(flag){
    saveCollapsed(flag);
    applyCollapsed(flag);
  }

  function toggleCollapsed(){
    setCollapsed(!isCollapsed());
  }

  function updateTokenUsageCard(usage){
    if (!usage || !tokenUsageCard) return;
    const today = usage.today || 0;
    const week = usage.week || 0;
    const month = usage.month || 0;
    const limit = usage.monthlyLimit;
    if (tokenTodayEl) tokenTodayEl.textContent = today;
    if (tokenWeekEl) tokenWeekEl.textContent = week;
    if (tokenMonthEl) tokenMonthEl.textContent = month;
    if (tokenLimitEl) tokenLimitEl.textContent = limit != null ? limit : '—';
    if (tokenBarFill){
      let percent = 0;
      if (limit && limit > 0){
        percent = Math.min((month / limit) * 100, 100);
      }
      tokenBarFill.style.width = `${percent}%`;
      let color = 'var(--brand)';
      if (percent > 90) color = '#ff4d4d';
      else if (percent > 60) color = '#ffcc00';
      tokenBarFill.style.background = color;
    }
    if (tokenBarNote){
      tokenBarNote.textContent = 'Token totals update automatically after each AI summary.';
    }
    tokenUsageCard.style.display = 'block';
  }

  function populateTokenInputs(usage){
    if (!usage) return;
    if (tokenTodayInput) tokenTodayInput.value = usage.today;
    if (tokenWeekInput) tokenWeekInput.value = usage.week;
    if (tokenMonthInput) tokenMonthInput.value = usage.month;
    if (tokenLimitInput) tokenLimitInput.value = usage.monthlyLimit != null ? usage.monthlyLimit : '';
  }

  function readTokenInputs(){
    const usage = loadTokenUsage();
    if (tokenTodayInput) usage.today = Number(tokenTodayInput.value) || 0;
    if (tokenWeekInput) usage.week = Number(tokenWeekInput.value) || 0;
    if (tokenMonthInput) usage.month = Number(tokenMonthInput.value) || 0;
    if (tokenLimitInput){
      const val = tokenLimitInput.value;
      usage.monthlyLimit = val !== '' ? Number(val) : null;
    }
    saveTokenUsage(usage);
    updateTokenUsageCard(usage);
    if (typeof onTokenUsageChange === 'function'){
      onTokenUsageChange(usage);
    }
  }

  function addTokenUsage(deltaTokens){
    if (!(deltaTokens > 0)) return;
    const usage = loadTokenUsage();
    usage.today += deltaTokens;
    usage.week += deltaTokens;
    usage.month += deltaTokens;
    saveTokenUsage(usage);
    updateTokenUsageCard(usage);
    populateTokenInputs(usage);
    if (typeof onTokenUsageChange === 'function'){
      onTokenUsageChange(usage);
    }
  }

  async function fetchAiSummaryFromSupabase(){
    const userId = getCurrentUserId();
    if (!userId || !supabaseClient) return null;
    try{
      const today = todayIso();
      const { data, error } = await supabaseClient
        .from('daily_reports')
        .select('report,timestamp')
        .eq('user_id', userId)
        .eq('date', today)
        .maybeSingle();
      if (error && error.code !== 'PGRST116'){
        console.warn('[AI summary] load error', error.message);
        return null;
      }
      if (!data || !data.report) return null;
      let parsed;
      try{
        parsed = typeof data.report === 'string' ? JSON.parse(data.report) : data.report;
      }catch(_){
        parsed = { text: data.report };
      }
      if (!parsed || !parsed.text) return null;
      if (!parsed.timestamp && data.timestamp){
        parsed.timestamp = data.timestamp;
      }
      saveLastSummary(parsed);
      return parsed;
    }catch(err){
      console.warn('[AI summary] load exception', err);
      return null;
    }
  }

  async function saveAiSummaryToSupabase(summary){
    const userId = getCurrentUserId();
    if (!userId || !supabaseClient) return false;
    try{
      const payload = {
        user_id: userId,
        date: todayIso(),
        report: JSON.stringify(summary || {})
      };
      const { error } = await supabaseClient
        .from('daily_reports')
        .upsert(payload, { onConflict: ['user_id', 'date'] });
      if (error){
        console.warn('[AI summary] save error', error.message);
        return false;
      }
      return true;
    }catch(err){
      console.warn('[AI summary] save exception', err);
      return false;
    }
  }

  function updateAvailability(){
    if (!card || !button || !hint) return;
    card.style.display = 'block';
    const key = getOpenAiKey();
    button.disabled = !key;
    hint.textContent = key
      ? 'AI summary uses OpenAI when you click the button. Data stays local until then.'
      : 'Set your OpenAI API key in Settings → AI Summary to enable.';
    applyCollapsed();
  }

  function renderLastSummary(){
    if (!output || !status) return;
    const saved = loadLastSummary();
    if (saved && saved.text){
      output.textContent = saved.text;
      const stamp = saved.timestamp ? new Date(saved.timestamp) : null;
      status.textContent = stamp ? `Last updated ${stamp.toLocaleString()}` : 'Last summary loaded.';
      return;
    }
    output.textContent = '';
    status.textContent = 'No AI summary yet.';
    const userId = getCurrentUserId();
    if (!userId) return;
    fetchAiSummaryFromSupabase().then(remote => {
      if (remote && remote.text){
        output.textContent = remote.text;
        const stamp = remote.timestamp ? new Date(remote.timestamp) : null;
        status.textContent = stamp ? `Last updated ${stamp.toLocaleString()}` : 'Loaded from cloud.';
      }
    });
  }

  function buildPrompt(ctx){
    const lines = [];
    lines.push('You are helping a USPS route analyst interpret daily metrics.');
    if (ctx.summaryText){
      lines.push(`Summary: ${ctx.summaryText}`);
    }
    if (ctx.catchupSummary && ctx.catchupSummary.count){
      const c = ctx.catchupSummary;
      const extra = c.addedMinutes ? `${(c.addedMinutes / 60).toFixed(2)} extra hours tagged` : '';
      const ratio = c.avgRouteRatio ? `avg route ratio ${c.avgRouteRatio.toFixed(2)}×` : '';
      const parts = [extra, ratio].filter(Boolean).join(' · ');
      lines.push(`Holiday catch-up context: ${c.count} day(s)${parts ? ` ${parts}` : ''}`);
    }
    if (ctx.weight && ctx.weight.enabled){
      lines.push(`Holiday downweight applied: average weight ${(ctx.weight.averageWeight || 1).toFixed(2)}, ${ctx.weight.downweighted || 0} day(s) affected.`);
    }
    const residuals = ctx.residuals || [];
    if (residuals.length){
      lines.push('Top residual days (actual - predicted route minutes):');
      residuals.forEach((r, idx) => {
        const tags = r.tags && r.tags.length ? ` tags: ${r.tags.join(', ')}` : '';
        const weather = r.weather ? ` weather: ${r.weather}` : '';
        const notes = r.notes ? ` notes: ${r.notes}` : '';
        lines.push(`${idx + 1}. ${r.iso}: ${r.deltaMinutes >= 0 ? '+' : ''}${r.deltaMinutes}m; parcels ${r.parcels}; letters ${r.letters}; boxholders ${r.boxholders || '—'}${tags}${weather}${notes}`);
      });
    }
    const dismissed = ctx.dismissed || [];
    if (dismissed.length){
      const list = dismissed.map(item => {
        const tags = (item.tags || [])
          .map(tag => (tag.minutes != null ? `${tag.reason} ${tag.minutes}m` : tag.reason))
          .join(', ');
        return `${item.iso}${tags ? ': ' + tags : ''}`;
      }).join('; ');
      lines.push(`Dismissed (already reviewed): ${list}`);
    }
    lines.push('Provide 3 concise bullet points: 1) root causes or contributing factors, 2) suggested actions or notes for tomorrow, 3) notable trends or items to watch. Keep it short and focused.');
    return lines.join('\n');
  }

  async function generateSummary(){
    if (!button) return;
    const key = getOpenAiKey();
    if (!key){
      if (status) status.textContent = 'Set your OpenAI API key in Settings first.';
      updateAvailability();
      return;
    }
    const ctx = typeof getDiagnosticsContext === 'function' ? getDiagnosticsContext() : null;
    if (!ctx || !(ctx.residuals || []).length){
      if (status) status.textContent = 'Run diagnostics first so residuals are available.';
      return;
    }
    const prompt = buildPrompt(ctx);
    setCollapsed(false);
    button.disabled = true;
    if (status) status.textContent = 'Generating summary…';
    if (output) output.textContent = '';
    try{
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0.4,
          messages: [
            { role: 'system', content: getAiBasePrompt(promptFallback) },
            { role: 'user', content: prompt }
          ]
        })
      });
      if (!response.ok){
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }
      const data = await response.json();
      let text = '';
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content === 'string'){
        text = content;
      } else if (Array.isArray(content)){
        text = content.map(part => (typeof part === 'string' ? part : part?.text || '')).join('');
      } else if (content && typeof content === 'object' && 'text' in content){
        text = content.text;
      }
      text = (text || '').trim() || '(No summary returned)';
      if (output) output.textContent = text;
      const stamp = new Date().toISOString();
      if (status) status.textContent = `Updated ${new Date(stamp).toLocaleTimeString()}`;
      const summaryPayload = { text, timestamp: stamp, prompt };
      const persisted = saveLastSummary(summaryPayload);
      await saveAiSummaryToSupabase(summaryPayload);
      if (persisted) renderLastSummary();
      const tokensUsed = data?.usage?.total_tokens;
      if (Number.isFinite(tokensUsed) && tokensUsed > 0){
        addTokenUsage(tokensUsed);
      }
      setCollapsed(false);
    }catch(err){
      console.error('[AI summary] error', err);
      if (status) status.textContent = `AI summary failed: ${err.message || err}`;
    }finally{
      button.disabled = false;
    }
  }

  return {
    updateAvailability,
    renderLastSummary,
    generateSummary,
    populateTokenInputs,
    readTokenInputs,
    setCollapsed,
    toggleCollapsed,
    addTokenUsage,
    applyCollapsed,
    fetchAiSummaryFromSupabase,
    updateTokenUsageCard
  };
}
