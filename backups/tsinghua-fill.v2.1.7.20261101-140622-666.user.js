// ==UserScript==
// @name         清华社视听说 - 新版填空与单选适配
// @namespace    local.tsinghuaelt.fill
// @version      2.1.7
// @description  当前页填空练习：读取公开Key，重试填写并验证结果
// @match        https://www.tsinghuaelt.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
(() => {
  'use strict';
  let active = false, cancelled = false;
  const cache = new Map();
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;right:20px;top:100px;z-index:2147483647;background:white;color:#222;padding:16px;border:2px solid #7735bb;border-radius:8px;max-width:300px;font:14px sans-serif;box-shadow:0 3px 15px #888';
  const label = document.createElement('div');
  label.textContent = '学习助手';
  const start = document.createElement('button');
  start.textContent = '开始当前页';
  const stop = document.createElement('button');
  stop.textContent = '停止';
  const status = document.createElement('p');
  status.textContent = '等待开始';
  const minimize = document.createElement('button');
  minimize.textContent = '最小化';
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:move;touch-action:none;user-select:none';
  header.append(label, minimize);
  const body = document.createElement('div');
  const logs = document.createElement('pre');
  logs.style.cssText = 'max-height:180px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font:12px monospace;background:#f5f1fa;padding:8px';
  const clear = document.createElement('button');
  clear.textContent = '清空日志';
  const copy = document.createElement('button');
  copy.textContent = '复制日志';
  const autoNext = document.createElement('input');
  autoNext.type = 'checkbox'; autoNext.checked = true;
  const nextLabel = document.createElement('label');
  nextLabel.append(autoNext, ' 成功后自动下一题');
  const actions = document.createElement('div'); actions.className = 'te-actions'; actions.append(start, stop);
  const details = document.createElement('details');
  const summary = document.createElement('summary'); summary.textContent = '运行日志';
  details.append(summary, clear, copy, logs);
  body.append(nextLabel, actions, status, details);
  panel.append(header, body);
  document.body.append(panel);
  panel.id = 'te-assistant-panel';
  const badge = document.createElement('span'); header.insertBefore(badge, minimize);
  const orb = document.createElement('button'); orb.className = 'te-orb'; orb.textContent = '学';
  orb.title = '展开学习助手（可拖动）'; orb.setAttribute('aria-label', orb.title); panel.append(orb);
  const style = document.createElement('style');
  style.textContent = `
    #te-assistant-panel{--tone:linear-gradient(135deg,#8629bc,#6044bf);--tint:#f6f2fc;box-sizing:border-box;width:330px;max-width:calc(100vw - 16px)!important;padding:0!important;border:0!important;border-radius:22px!important;background:#fff!important;color:#26213b!important;box-shadow:0 12px 40px #35245430!important;overflow:hidden;font:14px/1.5 system-ui,sans-serif!important;transition:width .38s cubic-bezier(.22,1,.36,1),border-radius .38s,box-shadow .3s}
    #te-assistant-panel[data-state=done]{--tone:linear-gradient(135deg,#239a74,#147a65);--tint:#effaf5}
    #te-assistant-panel[data-state=error]{--tone:linear-gradient(135deg,#dd5668,#b52c50);--tint:#fff0f3}
    #te-assistant-panel>div:first-child{background:var(--tone);color:white;padding:16px;gap:8px!important}
    #te-assistant-panel>div:first-child>div{font-weight:700;font-size:16px;flex:1}
    #te-assistant-panel>div:first-child>span{font-size:11px;opacity:.9;white-space:nowrap}
    #te-assistant-panel>div:nth-child(2){padding:16px;background:var(--tint);max-height:65vh;overflow:auto}
    #te-assistant-panel button{font:inherit;border:0;border-radius:10px;padding:7px 12px;cursor:pointer;background:#e9e3f3;color:#483360;margin:3px}
    #te-assistant-panel button:disabled{opacity:.45;cursor:default}
    #te-assistant-panel button:focus-visible{outline:3px solid #bc9ce8;outline-offset:2px}
    #te-assistant-panel>div:first-child button{background:#ffffff25;color:white;font-size:12px}
    #te-assistant-panel .te-actions{display:flex;gap:8px;margin-top:12px}
    #te-assistant-panel .te-actions button{flex:1;padding:10px}
    #te-assistant-panel .te-actions button:first-child{background:var(--tone);color:white}
    #te-assistant-panel p{padding:10px;background:#ffffffaa;border-radius:12px;overflow-wrap:anywhere;font-size:13px}
    #te-assistant-panel summary{cursor:pointer;font-weight:600;padding:8px 0}
    #te-assistant-panel input{accent-color:#802bb5}
    #te-assistant-panel .te-orb{display:none;margin:0;width:60px;height:60px;border-radius:50%;background:var(--tone);color:#fff;font-size:22px;font-weight:700;touch-action:none;cursor:grab;padding:0}
    #te-assistant-panel.te-collapsed{width:60px;height:60px;min-height:60px;border-radius:50%!important}
    #te-assistant-panel.te-collapsed>div{display:none!important}
    #te-assistant-panel.te-collapsed .te-orb{display:block}
    @media(prefers-reduced-motion:reduce){#te-assistant-panel{transition:none}}
  `;
  document.head.append(style);
  function setState(state) {
    panel.dataset.state = state;
    badge.textContent = ({idle:'待机',running:'运行中',done:'已完成',error:'异常',stopped:'已停止'})[state];
    orb.title = `${badge.textContent} · ${status.textContent}（点击展开，可拖动）`;
  }
  setState('idle');
  let expandedPosition, collapsed = false;
  const entries = [];
  const pinnedErrors = [];
  const errorBox = document.createElement('div');
  errorBox.style.cssText = 'max-height:140px;overflow:auto;white-space:pre-wrap;font:12px/1.5 monospace';
  details.insertBefore(errorBox, logs);
  function pinError(text) {
    const line = `[${new Date().toLocaleTimeString()}] ${pagination()?.textContent.trim() || '页码未知'} · ${text}`;
    pinnedErrors.unshift(line);
    if (pinnedErrors.length > 100) pinnedErrors.pop();
    errorBox.replaceChildren(...pinnedErrors.map(message => {
      const row = document.createElement('div'); row.textContent = message;
      row.style.cssText = 'background:#ffd7df;color:#971b35;padding:8px;border-radius:8px;margin-bottom:5px';
      return row;
    }));
    errorBox.scrollTop = 0; details.open = true;
    log(text);
  }
  function log(text) {
    entries.push(`[${new Date().toLocaleTimeString()}] ${text}`);
    if (entries.length > 300) entries.shift();
    logs.textContent = entries.join('\n');
    logs.scrollTop = logs.scrollHeight;
  }
  const say = text => { status.textContent = text; log(text); orb.title = `${badge.textContent} · ${text}（点击展开，可拖动）`; };
  clear.onclick = () => { entries.length = 0; pinnedErrors.length = 0; errorBox.replaceChildren(); logs.textContent = ''; };
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText([...pinnedErrors, ...entries].join('\n')); copy.textContent = '已复制'; }
    catch { log('复制失败，可选中日志手动复制'); }
    setTimeout(() => { copy.textContent = '复制日志'; }, 1500);
  };
  minimize.onclick = () => {
    const before = panel.getBoundingClientRect();
    if (!collapsed) expandedPosition = { left: before.left, top: before.top };
    collapsed = !collapsed;
    panel.classList.toggle('te-collapsed', collapsed);
    panel.style.right = 'auto';
    panel.style.left = (collapsed ? Math.max(8, innerWidth - 84) : Math.min(expandedPosition.left, Math.max(0, innerWidth - 330))) + 'px';
    panel.style.top = (collapsed ? Math.max(8, innerHeight - 84) : expandedPosition.top) + 'px';
    const after = panel.getBoundingClientRect();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) panel.animate([
      { transform: `translate(${before.left - after.left}px,${before.top - after.top}px) scale(.94)`, opacity:.65 },
      { transform:'translate(0,0) scale(1)', opacity:1 }
    ], { duration:400, easing:'cubic-bezier(.22,1,.36,1)' });
  };
  let orbDrag;
  orb.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const r = panel.getBoundingClientRect(); orbDrag = { x:e.clientX, y:e.clientY, left:r.left, top:r.top, moved:false };
    orb.setPointerCapture(e.pointerId);
  });
  orb.addEventListener('pointermove', e => {
    if (!orbDrag) return;
    if (Math.hypot(e.clientX-orbDrag.x,e.clientY-orbDrag.y)>4) orbDrag.moved=true;
    if (!orbDrag.moved) return;
    panel.style.left=(orbDrag.left+e.clientX-orbDrag.x)+'px'; panel.style.top=(orbDrag.top+e.clientY-orbDrag.y)+'px'; clampPanel();
  });
  let draggedOrb = false;
  orb.addEventListener('pointerup', () => { draggedOrb=!!orbDrag?.moved; orbDrag=null; });
  orb.addEventListener('lostpointercapture', () => { orbDrag=null; });
  orb.onclick = () => { if (!draggedOrb) minimize.onclick(); draggedOrb=false; };
  function clampPanel() {
    const rect = panel.getBoundingClientRect();
    panel.style.right = 'auto';
    panel.style.left = Math.max(0, Math.min(rect.left, innerWidth - rect.width)) + 'px';
    panel.style.top = Math.max(0, Math.min(rect.top, innerHeight - rect.height)) + 'px';
  }
  let drag;
  header.addEventListener('pointerdown', e => {
    if (e.target.closest('button') || e.button !== 0) return;
    const rect = panel.getBoundingClientRect();
    drag = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    header.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  header.addEventListener('pointermove', e => {
    if (!drag) return;
    panel.style.right = 'auto';
    panel.style.left = (e.clientX - drag.x) + 'px';
    panel.style.top = (e.clientY - drag.y) + 'px';
    clampPanel();
  });
  header.addEventListener('pointerup', () => { drag = null; });
  header.addEventListener('lostpointercapture', () => { drag = null; });
  window.addEventListener('resize', clampPanel);
  log('脚本2.1.7已加载');
  // 让框架完成本轮微任务与渲染，不再为每个空固定等待350ms。
  const settle = async () => {
    await Promise.resolve();
    await new Promise(resolve => requestAnimationFrame(() => resolve()));
  };
  const visible = e => e.getClientRects().length > 0;
  function root() {
    const roots = [...document.querySelectorAll('.unit-exercise-preview')].filter(visible);
    if (roots.length !== 1) throw Error('需要且只能有一个可见练习区域');
    return roots[0];
  }
  function contentPage() {
    const exercises = [...document.querySelectorAll('.unit-exercise-preview')].filter(visible);
    if (exercises.length) return null;
    return [...document.querySelectorAll('.unit-content-preview, .unit-home-preview, .unit-article-learning-page-preview')].find(visible) || null;
  }
  function signature() {
    const content = contentPage();
    if (content) {
      // 视频时间、播放状态、工具栏提示会变化，不能把整个textContent作为页标识。
      const stable = content.cloneNode(true);
      stable.querySelectorAll('.article-media, .res-video, .res-audio, .zty-video-player, video, audio, .paragraph-time, .ant-message, .ant-notification').forEach(e => e.remove());
      const item = content.closest('[data-content-id]');
      return JSON.stringify([location.pathname, location.search, location.hash, pagination()?.textContent.trim(), 'content', item?.getAttribute('data-content-id'), stable.textContent.replace(/\s+/g, ' ').trim()]);
    }
    const r = root();
    const instructions = [...r.querySelectorAll('.instruction-content')].map(e => e.textContent.trim());
    if (!instructions.length) throw Error('题目正在加载');
    // 输入框、结果节点及其ID会在提交/重试时重建，不能作为题目标识。
    const images = [...r.querySelectorAll('.res-image img')].map(e => e.getAttribute('src'));
    return JSON.stringify([location.pathname, location.search, location.hash, pagination()?.textContent.trim(), instructions, images]);
  }
  let page;
  let submitWatch = null;
  function check(loadingAllowed = false) {
    if (cancelled) throw Error('已停止');
    let current;
    try { current = signature(); }
    catch (error) { if (loadingAllowed) return false; throw error; }
    if (current !== page) throw Error('题目内容或网址已切换，已停止');
    return true;
  }
  async function wait(test) {
    let end = Date.now() + 20000;
    while (Date.now() < end) {
      if (submitWatch) {
        const notices = [...document.querySelectorAll('.ant-modal-content, .ant-message-notice-content, .ant-notification-notice, [role="alert"]')].filter(visible);
        const notice = notices.find(e => /提交过于频繁|提交失败|(?:1|一)\s*分钟后.*(?:再试|重试)/.test(e.textContent));
        if (notice) {
          check();
          const state = submitWatch;
          if (state.retries >= 4) { submitWatch = null; throw Error('提交连续失败，已达4次自动重试上限'); }
          const limited = /提交过于频繁|(?:1|一)\s*分钟后.*(?:再试|重试)/.test(notice.textContent);
          const seconds = limited ? 10 : 3;
          state.retries++;
          say(`${limited ? '提交过于频繁' : '提交失败'}：等待${seconds}秒后重试（${state.retries}/4）`);
          const ok = [...notice.querySelectorAll('button')].find(e => /^(确定|知道了|我知道了|OK|确认)$/.test(e.textContent.trim()));
          if (ok) ok.click();
          else notice.querySelector('.ant-notification-notice-close')?.click();
          for (let i = 0; i < seconds * 4; i++) {
            check(true);
            await new Promise(resolve => setTimeout(resolve, 250));
          }
          check();
          const remaining = [...document.querySelectorAll('.ant-modal-content')].filter(visible).some(e => /提交过于频繁|提交失败/.test(e.textContent));
          if (remaining) throw Error('提示弹窗尚未关闭，请手动关闭后重新开始');
          log('等待结束，重新提交');
          await submit(true);
          end = Date.now() + 20000;
          continue;
        }
      }
      if (check(true) && test()) return;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw Error('等待页面响应超时，请检查提示或网络');
  }
  const fields = () => [...root().querySelectorAll('.zty-exercise-item-fill-blank-do[contenteditable="true"]')].filter(visible);
  const results = () => [...root().querySelectorAll('.zty-exercise-item-fill-blank-done')].filter(visible);
  function answerCount() {
    const text = root().querySelector('.unit-exercise-answer-account')?.textContent || '';
    const match = text.match(/作答次数\s*[：:]\s*(\d+)/);
    return match ? Number(match[1]) : null;
  }
  function diagnostics() {
    try {
      return JSON.stringify({ count: answerCount(), inputs: fields().length,
        results: results().length, keys: readKey(),
        buttons: [...root().querySelectorAll('.exercise-actions button')].map(e => ({ text: e.textContent.trim(), disabled: e.disabled })),
        notices: [...document.querySelectorAll('[role="alert"], .ant-message-notice-content, .ant-notification-notice-description, .ant-modal-body')].filter(visible).map(e => e.textContent.trim()) });
    } catch (e) { return e.message; }
  }
  function correct() {
    const r = results();
    return r.length > 0 && r.every(e => {
      if (e.classList.contains('zty-exercise-item-fill-blank-done-right')) return true;
      const item = e.closest('.exercise-item');
      if (!e.classList.contains('zty-exercise-item-fill-blank-done-sub') || !item?.querySelector('.answer-card_suggested-btn')) return false;
      // Suggested answer 属主观题：已有提交结果即结束，不将建议文案当作标准答案。
      return true;
    });
  }
  function fillItems() {
    return [...new Set([...root().querySelectorAll('.zty-exercise-item-fill-blank-do, .zty-exercise-item-fill-blank-done')].map(e => e.closest('.exercise-item')).filter(Boolean))];
  }
  function selectFillAlternative(text) {
    const answer = text.trim().replace(/^[（(]\s*\d+\s*[）)]\s*/, '');
    // 处理单词备选及 ten/10 这类词与数字备选，纯数字分数和URL保持原样。
    if (/[A-Za-z]/.test(answer) && /^(?:[A-Za-z]+(?:['’\-][A-Za-z]+)*|\d+(?:\.\d+)?)(?:\s*\/\s*(?:[A-Za-z]+(?:['’\-][A-Za-z]+)*|\d+(?:\.\d+)?))+$/.test(answer)) {
      const selected = answer.split('/')[0].trim();
      log(`填空备选答案：${answer} → ${selected}`);
      return selected;
    }
    return answer;
  }
  function readKey() {
    return fillItems().map(item => item.querySelector('.answer-card_suggested-btn')
      ? [...item.querySelectorAll('.zty-exercise-item-fill-blank-done')].map(() => '-')
      : [...item.querySelectorAll('.answer-card__key-value > span')].map(e => selectFillAlternative(e.textContent)));
  }
  async function submit(retrying = false) {
    log('填写操作完成，统一等待1秒后提交');
    const started = performance.now();
    while (performance.now() - started < 1000) {
      check();
      await new Promise(resolve => setTimeout(resolve, Math.max(1, 1000 - (performance.now() - started))));
    }
    check();
    click('Submit', retrying);
  }
  function click(text, retrying = false) {
    check();
    const buttons = [...root().querySelectorAll('.exercise-actions button')].filter(e => visible(e) && e.textContent.trim().toLowerCase() === text.toLowerCase() && !e.disabled && e.getAttribute('aria-disabled') !== 'true');
    if (buttons.length !== 1) throw Error('找不到唯一可用的 ' + text + ' 按钮');
    log(`点击 ${text}，当前作答次数：${answerCount() ?? '未知'}`);
    if (text === 'Submit' && !retrying) submitWatch = { retries: 0 };
    if (text === 'Retry') submitWatch = null;
    buttons[0].click();
  }
  async function retry() {
    click('Retry');
    await wait(() => fields().length > 0 && results().length === 0);
  }
  async function fill(answers) {
    // 网站 Ij.watchDoRecordChange -> ie() 延迟1000ms才执行 re() 绑定事件。
    // 填空框出现不代表编辑器可用；提前输入只会改DOM而不会更新答案数组。
    await wait(() => {
      // 普通填空挂在 .stem-content，对话填空挂在 .dialogue。
      // 网站统一给实际事件容器 do_<题号> 标记初始化状态。
      const editable = fields();
      const containers = editable.map(e => e.closest('[id^="do_"]'));
      return editable.length > 0 && containers.every(e => e && root().contains(e) && e.dataset.teFillBlankContainerInited === '1');
    });
    check();
    const items = fillItems();
    if (!items.length || items.some((item, i) => {
      const f = [...item.querySelectorAll('.zty-exercise-item-fill-blank-do[contenteditable="true"]')].filter(visible);
      return !f.length || (answers && (answers[i]?.length !== f.length || answers[i].some(a => !a)));
    })) throw Error('题型或答案数量不匹配，仅支持每题均为填空的页面');
    const counts = items.map(item => [...item.querySelectorAll('.zty-exercise-item-fill-blank-do[contenteditable="true"]')].filter(visible).length);
    for (let i = 0; i < counts.length; i++) {
      for (let j = 0; j < counts[i]; j++) {
        check();
        // doRecordChange 可触发 Vue 重建整题；绝不能继续使用先前缓存的节点。
        const item = fillItems()[i];
        const e = [...item.querySelectorAll('.zty-exercise-item-fill-blank-do[contenteditable="true"]')].filter(visible)[j];
        if (!e?.isConnected) throw Error('填写时输入框结构已变化');
        e.focus();
        const text = answers ? answers[i][j] : '-';
        const range = document.createRange();
        range.selectNodeContents(e);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        // 浏览器编辑命令会走 contenteditable 的编辑流程并触发 input。
        const inserted = document.execCommand('insertText', false, text);
        if (!inserted) {
          e.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
          e.textContent = text;
          e.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
        }
        e.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Unidentified' }));
        e.dispatchEvent(new Event('change', { bubbles: true }));
        // 网站用 mouseover/mouseout 维护 inner；只有 inner=false 且
        // focus=false 时，E(id) 才向上层发出 doRecordChange。
        e.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
        e.blur();
        e.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: start }));
        await settle();
      }
    }
    // 让 Vue 的状态同步和失焦校验先完成，随后再提交。
    await settle();
    check();
    const currentItems = fillItems();
    for (let i = 0; i < counts.length; i++) {
      const current = [...currentItems[i].querySelectorAll('.zty-exercise-item-fill-blank-do[contenteditable="true"]')].filter(visible);
      if (current.length !== counts[i] || current.some((e, j) => e.textContent.replace(/[\u200b\ufeff]/g, '').trim() !== (answers ? answers[i][j] : '-').trim())) {
        throw Error('填写后部分答案丢失，已停止提交；需要进一步检查网站状态同步逻辑');
      }
    }
  }
  const radioGroups = () => [...root().querySelectorAll('.ant-radio-group')].filter(visible);
  const radioEditable = () => radioGroups().length > 0 && radioGroups().every(g => g.querySelector('input[type="radio"]:not(:disabled)'));
  const radioDone = () => radioGroups().length > 0 && radioGroups().every(g => [...g.querySelectorAll('input[type="radio"]')].every(e => e.disabled));
  const radioCorrect = () => radioDone() && radioGroups().every(g => g.classList.contains('radio-group-right'));
  function radioKey() {
    return radioGroups().map(g => {
      const item = g.closest('.exercise-item');
      const key = item?.querySelector('.answer-card__key-value')?.textContent.trim();
      if (!/^[A-Z]$/.test(key || '')) return null;
      const labels = [...g.querySelectorAll('label')];
      const target = labels.find(l => l.textContent.trim().startsWith(key + '.'));
      return target?.querySelector('input')?.value || null;
    });
  }
  async function runRadio() {
    let saved;
    const known = [];
    for (let attempt = 0; attempt < 6; attempt++) {
      check();
      if (radioCorrect()) { say('已验证：当前页单选全部正确'); return; }
      const keys = radioKey();
      radioGroups().forEach((g, i) => {
        if (g.classList.contains('radio-group-right')) {
          const value = g.querySelector('input:checked')?.value;
          if (value) { known[i] = value; log(`保留第${i + 1}题已正确的选项`); }
        }
      });
      if (keys.length && keys.every(Boolean)) saved = keys;
      if (!radioEditable()) {
        click('Retry');
        await wait(radioEditable);
      }
      const count = radioGroups().length;
      if (!count || (saved && saved.length !== count)) throw Error('单选题数量不匹配');
      say(saved ? '按 Key 选择正确选项' : `单选尝试提交 ${attempt + 1}/6`);
      const expected = [];
      for (let i = 0; i < count; i++) {
        check();
        const options = [...radioGroups()[i].querySelectorAll('input[type="radio"]')];
        const value = saved?.[i] || known[i];
        const target = value ? options.find(e => e.value === value) : options[attempt % options.length];
        if (!target || target.disabled) throw Error('无法匹配可用单选项');
        expected.push(target.value);
        target.click();
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      if (radioGroups().some((g, i) => g.querySelector('input:checked')?.value !== expected[i])) throw Error('单选项状态未保存，已停止');
      log('单选填写完成，等待0.5秒同步后提交');
      
      check();
      if (radioGroups().length !== count || radioGroups().some((g, i) => g.querySelector('input:checked')?.value !== expected[i])) throw Error('等待同步后选项发生变化，已停止');
      const before = answerCount();
      await submit();
      await wait(() => radioDone() || (before !== null && answerCount() > before));
      await new Promise(resolve => setTimeout(resolve, 2500));
      check();
      if (radioCorrect()) { say('已验证：当前页单选全部正确'); return; }
      if (saved) throw Error('按 Key 选择后仍未确认全部正确，已停止');
    }
    throw Error('单选已达6次提交上限');
  }
  function mouseClick(element) {
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    if (!hit || !(element === hit || element.contains(hit))) throw Error('录音按钮被遮挡，请关闭弹窗后重试');
    const base = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 };
    for (const type of ['pointerover', 'pointermove', 'mouseover', 'mousemove', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      const down = type.endsWith('down');
      const event = type.startsWith('pointer')
        ? new PointerEvent(type, { ...base, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: down ? 1 : 0 })
        : new MouseEvent(type, { ...base, buttons: down ? 1 : 0, detail: type === 'click' ? 1 : 0 });
      hit.dispatchEvent(event);
    }
  }
  async function runOral(shouldSubmit = true) {
    const selector = '.oral-brief-course-do';
    const oral = () => [...root().querySelectorAll(selector)].filter(visible);
    const count = oral().length;
    if (!count || (shouldSubmit && fields().length) || radioGroups().length) throw Error('当前录音混合结构不受支持');
    for (let i = 0; i < count; i++) {
      check();
      const button = oral()[i]?.querySelector('.ly-button');
      if (!button || !button.querySelector('img[src$="/record.png"]')) throw Error(`第${i + 1}题不是待录音状态，已停止，避免误点`);
      say(`第${i + 1}/${count}题：等待进入录音状态`);
      mouseClick(button);
      const recording = () => oral()[i]?.querySelector('.ly-button img[src$="/recording.gif"]');
      const deadline = performance.now() + 15000;
      while (!recording()) {
        check();
        if (performance.now() >= deadline) throw Error(`第${i + 1}题未进入录音状态，请检查麦克风权限`);
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      say(`第${i + 1}/${count}题：录音状态已确认，至少保持1秒`);
      const started = performance.now();
      while (performance.now() - started < 1000) {
        if (signature() !== page) throw Error('录音期间页面变化，请手动停止录音');
        if (!recording()) throw Error('录音状态提前结束，未满足1秒，已停止提交');
        await new Promise(resolve => setTimeout(resolve, Math.min(50, Math.max(1, 1000 - (performance.now() - started)))));
      }
      const current = [...document.querySelectorAll('.unit-exercise-preview .oral-brief-course-do')].filter(visible)[i];
      const stopButton = current?.querySelector('.ly-button');
      // 即使用户请求停止，也先尝试结束本次已启动的录音。
      if (signature() !== page || !stopButton) throw Error('录音期间页面发生变化，请手动检查并停止录音');
      if (!stopButton.querySelector('img[src$="/recording.gif"]')) throw Error('停止前未确认录音状态，已停止提交');
      log(`第${i + 1}题：录音状态已保持${((performance.now() - started) / 1000).toFixed(2)}秒`);
      mouseClick(stopButton);
      log(`第${i + 1}题：已点击停止录音`);
      await new Promise(resolve => setTimeout(resolve, 700));
      check();
    }
    if (!shouldSubmit) { log('混合题录音操作完成，交由统一流程提交'); return; }
    say('录音操作完成，等待保存后提交');
    
    check();
    const before = answerCount();
    await submit();
    await wait(() => (before !== null && answerCount() > before) || [...root().querySelectorAll('.exercise-actions button')].some(e => visible(e) && e.textContent.trim() === 'Retry'));
    say('录音题提交已确认；未验证评分或录音内容');
  }
  const normalize = text => text.replace(/\s+/g, ' ').trim();
  const dragModule = () => root().querySelector('.drag-drop-one-exam-do, .drag-drop-one-exam-done');
  const dropRows = () => [...dragModule().querySelectorAll('.drop-zone-item-wrapper')];
  const dragDone = () => !!root().querySelector('.drag-drop-one-exam-done');
  const dragCorrect = () => dragDone() && dropRows().length > 0 && dropRows().every(e => e.querySelector('.user-answer.correct'));
  async function runDrag() {
    if (root().querySelectorAll('.drag-drop-one-exam-do, .drag-drop-one-exam-done').length !== 1 || fields().length || radioGroups().length) throw Error('暂只支持单个拖拽配对模块');
    let saved;
    for (let attempt = 0; attempt < 6; attempt++) {
      check();
      if (dragCorrect()) { say('已验证：拖拽配对全部正确'); return; }
      const keys = dropRows().map(e => normalize(e.querySelector('.answer-card__key-value')?.textContent || ''));
      if (keys.length && keys.every(Boolean)) saved = keys;
      if (dragDone()) { click('Retry'); await wait(() => !!root().querySelector('.drag-drop-one-exam-do')); }
      const count = dropRows().length;
      if (!count || (saved && saved.length !== count)) throw Error('拖拽答案数量不匹配');
      const used = new Set();
      for (let i = 0; i < count; i++) {
        check();
        const row = dropRows()[i];
        const options = [...dragModule().querySelectorAll('.drag-item-list .drag-item[draggable="true"]')];
        const source = options.find(e => !used.has(normalize(e.textContent)) && (!saved || normalize(e.textContent) === saved[i]));
        if (!source) throw Error(`找不到第${i + 1}项对应的拖拽选项`);
        const text = normalize(source.textContent);
        const existing = normalize(row.querySelector('.dropped-item-text')?.textContent || '');
        if (existing !== text) {
          const destination = row.querySelector('.answer-placeholder, .answer-container');
          if (!destination) throw Error('找不到拖放目标');
          const dataTransfer = new DataTransfer();
          const fire = (element, type) => element.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer }));
          fire(source, 'dragstart');
          fire(destination, 'dragenter');
          fire(destination, 'dragover');
          fire(destination, 'drop');
          fire(source, 'dragend');
          await settle();
          const actual = normalize(dropRows()[i].querySelector('.dropped-item-text')?.textContent || '');
          if (actual !== text) throw Error(`第${i + 1}项拖放未生效，已停止；需要查看 dragstart/drop 事件源码`);
        }
        used.add(text);
        log(`第${i + 1}/${count}项拖放已确认：${text}`);
      }
      say(saved ? '已按 Key 配对，等待0.5秒后提交' : `拖拽尝试提交 ${attempt + 1}/6`);
      
      const before = answerCount();
      await submit();
      await wait(() => dragDone() || (before !== null && answerCount() > before));
      await new Promise(resolve => setTimeout(resolve, 1000));
      check();
      if (dragCorrect()) { say('已验证：拖拽配对全部正确'); return; }
      if (saved) throw Error('按 Key 拖放后仍未全部正确，已停止');
    }
    throw Error('拖拽已达6次提交上限');
  }
  async function runJudge() {
    const groups = () => [...root().querySelectorAll('.judge-main .judge-option-item')].filter(visible);
    if (groups().length !== radioGroups().length || fields().length) throw Error('暂不支持判断与其他题型混合');
    const count = groups().length;
    const rejected = Array.from({ length: count }, () => new Set());
    const known = Array(count).fill(null);
    const options = g => [...g.querySelectorAll('.option-line')].map(line => ({
      value: line.querySelector('input')?.value,
      text: normalize(line.querySelector('.option-show, .option-hidden')?.textContent || '')
    }));
    for (let round = 0; round < 6; round++) {
      check();
      const gs = groups();
      if (gs.length !== count) throw Error('判断题数量变化');
      if (gs.every(g => g.classList.contains('radio-group-right'))) { say('已验证：判断题全部正确'); return; }
      const keys = [...root().querySelectorAll('.judge-main .answer-card__key-value > span')].map(e => normalize(e.textContent).replace(/^[（(]\s*\d+\s*[）)]\s*/, ''));
      gs.forEach((g, i) => {
        const selected = g.querySelector('input:checked')?.value;
        if (selected && g.classList.contains('radio-group-right')) known[i] = selected;
        if (selected && g.classList.contains('radio-group-wrong')) rejected[i].add(selected);
        if (keys.length === count) {
          const match = options(g).find(o => o.text === keys[i]);
          if (match) known[i] = match.value;
        }
      });
      if (!radioEditable()) { click('Retry'); await wait(radioEditable); }
      const expected = [];
      for (let i = 0; i < count; i++) {
        check();
        const opts = options(groups()[i]);
        if (opts.length < 2 || opts.length > 3) throw Error('目前仅支持二选一或三选一判断');
        const choice = known[i] || opts.find(o => !rejected[i].has(o.value))?.value;
        if (!choice) throw Error(`第${i + 1}题所有选项已被排除，反馈可能不一致`);
        const target = [...groups()[i].querySelectorAll('input')].find(e => e.value === choice);
        if (!target || target.disabled) throw Error('判断选项不可用');
        target.click(); expected.push(choice);
        await settle();
      }
      say(`判断第${round + 1}轮：保留已正确选项，仅更换已排除的答案`);
      
      if (groups().some((g, i) => g.querySelector('input:checked')?.value !== expected[i])) throw Error('判断选项未保存');
      const before = answerCount();
      await submit();
      await wait(() => radioDone() || (before !== null && answerCount() > before));
      await new Promise(resolve => setTimeout(resolve, 1000));
      check();
    }
    if (groups().every(g => g.classList.contains('radio-group-right'))) { say('已验证：判断题全部正确'); return; }
    throw Error('判断题已达6轮提交上限；若页面不提供逐题对错，请提供首次提交后的HTML');
  }
  async function runMultiple() {
    const groups = () => [...root().querySelectorAll('.ant-checkbox-group')].filter(visible);
    const done = () => groups().length > 0 && groups().every(g => [...g.querySelectorAll('input')].every(e => e.disabled));
    function keyFor(g) {
      const item = g.closest('.exercise-item');
      const key = item?.querySelector('.answer-card__key-value')?.textContent.trim();
      if (!key || !/^[A-Z\s,，、;；]+$/.test(key)) return null;
      const letters = [...new Set(key.match(/[A-Z]/g))];
      const labels = [...g.querySelectorAll('label')];
      const values = letters.map(letter => labels.find(l => l.textContent.trim().startsWith(letter + '.'))?.querySelector('input')?.value);
      return values.length && values.every(Boolean) ? values : null;
    }
    function correctMultiple() {
      return done() && groups().every(g => {
        const key = keyFor(g);
        const checked = [...g.querySelectorAll('input:checked')].map(e => e.value);
        // 有Key时按完整集合验证，避免仅检查勾中项而遗漏正确选项。
        if (key) return checked.length === key.length && key.every(v => checked.includes(v));
        const use = g.closest('.exercise-item')?.querySelector('.answer-card__status use');
        return (use?.getAttribute('href') || use?.getAttribute('xlink:href')) === '#icon-right';
      });
    }
    if (radioGroups().length || fields().length) throw Error('暂不支持多选与其他题型混合');
    const count = groups().length;
    let saved;
    const known = [];
    for (let round = 0; round < 6; round++) {
      check();
      if (correctMultiple()) { say('已验证：多选题全部正确'); return; }
      const keys = groups().map(keyFor);
      groups().forEach((g, i) => {
        const use = g.closest('.exercise-item')?.querySelector('.answer-card__status use');
        if ((use?.getAttribute('href') || use?.getAttribute('xlink:href')) === '#icon-right') {
          known[i] = [...g.querySelectorAll('input:checked')].map(e => e.value);
          log(`保留第${i + 1}道多选题已正确的组合`);
        }
      });
      if (keys.length === count && keys.every(Boolean)) saved = keys;
      if (done()) { click('Retry'); await wait(() => groups().length === count && groups().every(g => g.querySelector('input:not(:disabled)'))); }
      const expected = [];
      for (let i = 0; i < count; i++) {
        const opts = [...groups()[i].querySelectorAll('input[type="checkbox"]')];
        const desired = saved?.[i] || known[i] || opts.slice(0, Math.min(2, opts.length)).map(e => e.value);
        if (!desired.length) throw Error('多选选项为空');
        expected.push(desired);
        for (const value of opts.map(e => e.value)) {
          check();
          const current = [...groups()[i].querySelectorAll('input')].find(e => e.value === value);
          if (!current || current.disabled) throw Error('多选选项不可用');
          if (current.checked !== desired.includes(value)) { current.click(); await settle(); }
        }
      }
      say(saved ? '已按 Key 勾选，等待0.5秒后提交' : `多选尝试提交 ${round + 1}/6，等待 Key`);
      
      if (groups().length !== count || groups().some((g, i) => {
        const selected = [...g.querySelectorAll('input:checked')].map(e => e.value);
        return selected.length !== expected[i].length || selected.some(v => !expected[i].includes(v));
      })) throw Error('多选勾选状态未保存');
      const before = answerCount();
      await submit();
      await wait(() => done() || (before !== null && answerCount() > before));
      await new Promise(resolve => setTimeout(resolve, 1000));
      check();
      if (correctMultiple()) { say('已验证：多选题全部正确'); return; }
      if (saved) throw Error('按 Key 提交后仍未确认正确，已停止');
    }
    throw Error('多选题已达6轮提交上限');
  }
  async function runTextAnswer() {
    const selector = '.do-record textarea[placeholder="请输入答案内容"]';
    const editors = [...root().querySelectorAll(selector)].filter(visible);
    if (!editors.length || fields().length || radioGroups().length || root().querySelector('.ant-checkbox-group, .oral-brief-course-do')) throw Error('暂不支持文本框与其他题型混合');
    if (editors.some(e => e.disabled || e.readOnly)) throw Error('部分答案文本框不可编辑');
    say(`主观文本题：${editors.length}个文本框填写 -，统一提交一次`);
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (!setter) throw Error('无法设置文本框内容');
    for (let i = 0; i < editors.length; i++) {
      check();
      const editor = [...root().querySelectorAll(selector)].filter(visible)[i];
      if (!editor || editor.disabled || editor.readOnly) throw Error(`第${i + 1}个文本框不可用`);
      editor.focus();
      setter.call(editor, '-');
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      editor.dispatchEvent(new Event('change', { bubbles: true }));
      editor.blur();
      await settle();
      log(`已填写第${i + 1}/${editors.length}个主观题文本框`);
    }
    
    check();
    const currentEditors = [...root().querySelectorAll(selector)].filter(visible);
    if (currentEditors.length !== editors.length || currentEditors.some(e => e.value !== '-')) throw Error('部分主观题答案未保存，已停止');
    const before = answerCount();
    await submit();
    await wait(() => (before !== null && answerCount() > before) || [...root().querySelectorAll('.exercise-actions button')].some(e => visible(e) && e.textContent.trim() === 'Retry'));
    say('主观文本题提交已确认；未验证主观评分');
  }
  async function runDragMany() {
    const module = () => root().querySelector('.drag-drop-many-exam-do, .drag-drop-many-exam-done');
    const rows = () => [...module().querySelectorAll('.drop-zone-item-wrapper')];
    const done = () => module().classList.contains('drag-drop-many-exam-done');
    const keys = () => rows().map(row => [...row.querySelectorAll('.answer-card__key-value > span')].map(e => normalize(e.textContent)));
    const texts = row => [...row.querySelectorAll('.answer-container:not(.correct-answer) .dropped-item-text')].map(e => normalize(e.textContent));
    const equal = (a, b) => a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);
    function correctMany() {
      const answer = keys();
      return done() && answer.length > 0 && answer.every((a, i) => a.length > 0 && equal(a, texts(rows()[i])));
    }
    if (root().querySelectorAll('.drag-drop-many-exam-do, .drag-drop-many-exam-done').length !== 1 || fields().length || radioGroups().length) throw Error('暂不支持多卡拖拽混合题');
    let saved;
    for (let round = 0; round < 6; round++) {
      check();
      if (correctMany()) { say('已验证：多卡拖拽全部正确'); return; }
      const answer = keys();
      if (answer.length && answer.every(a => a.length && a.every(Boolean))) saved = answer;
      if (done()) { click('Retry'); await wait(() => !!root().querySelector('.drag-drop-many-exam-do')); }
      const count = rows().length;
      if (!count || (saved && saved.length !== count)) throw Error('多卡拖拽答案数量不匹配');
      const used = new Set();
      const expected = [];
      for (let i = 0; i < count; i++) {
        const options = () => [...module().querySelectorAll('.drag-item-list .drag-item[draggable="true"]')];
        const trial = options().find(e => !used.has(normalize(e.textContent)));
        const desired = saved ? saved[i] : [normalize(trial?.textContent || '')];
        if (!desired.length || desired.some(t => !t)) throw Error('没有足够的试填卡片');
        expected.push(desired);
        for (const text of desired) {
          check();
          if (texts(rows()[i]).includes(text)) { used.add(text); continue; }
          const source = options().find(e => normalize(e.textContent) === text);
          const target = rows()[i].querySelector('.answer-container:not(.correct-answer)');
          if (!source || !target) throw Error(`找不到第${i + 1}题的拖拽选项或目标`);
          const transfer = new DataTransfer();
          const fire = (e, type) => e.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }));
          fire(source, 'dragstart'); fire(target, 'dragenter'); fire(target, 'dragover'); fire(target, 'drop'); fire(source, 'dragend');
          await settle();
          if (!texts(rows()[i]).includes(text)) throw Error(`第${i + 1}题卡片拖放未生效，已停止`);
          used.add(text);
          log(`第${i + 1}题拖入：${text}`);
        }
        if (!equal(texts(rows()[i]), desired)) throw Error(`第${i + 1}题有多余或缺失卡片，已停止`);
      }
      say(saved ? '多卡拖拽：已按 Key 放入全部卡片' : `多卡拖拽：每题放入一张，尝试第${round + 1}轮`);
      
      check();
      if (rows().length !== count || rows().some((row, i) => !equal(texts(row), expected[i]))) throw Error('提交前多卡拖拽内容发生变化');
      const before = answerCount();
      await submit();
      await wait(() => done() || (before !== null && answerCount() > before));
      await new Promise(resolve => setTimeout(resolve, 1000));
      check();
      if (correctMany()) { say('已验证：多卡拖拽全部正确'); return; }
      if (saved) throw Error('按 Key 提交后多卡拖拽仍未全部正确');
    }
    throw Error('多卡拖拽已达6轮提交上限');
  }
  async function runCurrent() {
      page = signature();
      const content = contentPage();
      if (content) {
        const articles = content.matches('.unit-article-learning-page-preview') ? [content] : [...content.querySelectorAll('.unit-article-learning-page-preview')].filter(visible);
        if (articles.length === 1 && articles[0].querySelector('video')) {
          const paragraphs = [...articles[0].querySelectorAll('.paragraphs-list .paragraph-item.clickable')];
          const last = paragraphs.at(-1);
          if (!last) throw Error('视频讲解页没有可点击段落，已停止');
          say(`视频讲解页：点击最后一段（${last.querySelector('.paragraph-time')?.textContent.trim() || paragraphs.length}）`);
          last.scrollIntoView({ block: 'center' });
          last.click();
          const end = Date.now() + 10000;
          while (Date.now() < end) {
            check();
            const current = [...articles[0].querySelectorAll('.paragraphs-list .paragraph-item.clickable')].at(-1);
            if (current?.classList.contains('active')) {
              log('最后一段已激活；等待1秒让页面保存进度');
              await new Promise(resolve => setTimeout(resolve, 1000));
              check();
              say('已确认最后一段激活，视频页操作完成');
              return;
            }
            await new Promise(resolve => setTimeout(resolve, 200));
          }
          throw Error('点击后未确认最后一段激活，已停止');
        }
        if (content.querySelector('video, iframe, input, textarea, [contenteditable="true"], .ly-button, .choices, .exercise-actions')) throw Error('内容页包含视频或交互模块，作为未知题型停止');
        log(`识别无题讲解/首页：${pagination()?.textContent.trim() || '页码未知'}`);
        say(autoNext.checked ? '无题页面，准备进入下一页' : '无题页面；自动下一题未开启，已停止');
        return;
      }
      if (root().querySelector('.listen-repeat-view')) throw Error('未知题型：带样本的跟读题，已停止');
      if (root().querySelector('.drag-drop-many-exam-do, .drag-drop-many-exam-done')) { await runDragMany(); return; }
      if (root().querySelector('.do-record textarea[placeholder="请输入答案内容"]')) { await runTextAnswer(); return; }
      if (root().querySelector('.ant-checkbox-group')) { await runMultiple(); return; }
      if (root().querySelector('.judge-main')) { await runJudge(); return; }
      if (dragModule()) { await runDrag(); return; }
      if (root().querySelector('.oral-brief-course-do') && !fields().length) {
        await runOral();
        return;
      }
      if (radioGroups().length) {
        if (fields().length || root().querySelector('input[type="checkbox"]')) throw Error('暂不支持混合题型或多选');
        await runRadio();
        return;
      }
      if (!fields().length && !results().length) throw Error('未知题型或纯视频页，已停止');
      for (let attempt = 0; attempt < 6; attempt++) {
        check();
        if (correct()) { say(root().querySelector('.answer-card_suggested-btn') ? '填空提交已确认：客观空正确，Suggested answer主观空仅提交、不验证评分' : '已验证：当前页填空全部正确'); return; }
        const keys = readKey();
        if (keys.length && keys.every(a => a.length && a.every(Boolean))) cache.set(page, keys);
        // 前几次提交后可能仍停留在编辑态，无需也不存在 Retry。
        if (!fields().length && results().length) await retry();
        const answers = cache.get(page);
        say(answers ? '填写网站公布的答案' : `尝试提交 ${attempt + 1}/6，等待网站显示 Key`);
        await fill(answers);
        if (root().querySelector('.oral-brief-course-do')) {
          await runOral(false);
          
        }
        const beforeCount = answerCount();
        await submit();
        try {
          await wait(() => {
            const count = answerCount();
            return (beforeCount !== null && count !== null && count > beforeCount) ||
              (fields().length === 0 && results().length > 0);
          });
        } catch (error) {
          if (error.message.startsWith('等待页面响应超时')) {
            throw Error(`提交未获确认（提交前次数=${beforeCount}）。诊断：${diagnostics()}`);
          }
          throw error;
        }
        // 次数更新和答案组件渲染可能不在同一帧完成。
        await new Promise(resolve => setTimeout(resolve, 1000));
        check();
        if (correct()) { say(root().querySelector('.answer-card_suggested-btn') ? '填空提交已确认：客观空正确，Suggested answer主观空仅提交、不验证评分' : '已验证：当前页填空全部正确'); return; }
        if (answers) throw Error('公布答案填写后仍未全部正确，已停止，请检查可接受答案格式');
      }
      throw Error('已达6次提交上限，未能确认全部正确');
  }
  function pagination() {
    return [...document.querySelectorAll('.preview-pagination .pagination-text')].find(visible);
  }
  async function advance(skipping = false) {
    if (cancelled) throw Error('已停止');
    if (!skipping) check();
    const text = pagination();
    const match = text?.textContent.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
    if (!match) throw Error('无法识别当前页码，已停止');
    if (+match[1] >= +match[2]) { say('已到最后一页，自动答题结束'); return false; }
    const button = text.closest('.preview-pagination').querySelector('.pagination-right')?.closest('button');
    if (!button || button.disabled) throw Error('下一题按钮不可用');
    const expected = +match[1] + 1;
    const originalPageText = text.textContent.trim();
    log(`准备进入第${expected}页`);
    await new Promise(resolve => setTimeout(resolve, 500));
    if (cancelled) throw Error('已停止');
    if (!skipping) check();
    if (pagination()?.textContent.trim() !== originalPageText) throw Error('翻页前页码发生变化，已停止');
    submitWatch = null;
    button.click();
    const end = Date.now() + 20000;
    let stable = '', since = 0;
    while (Date.now() < end) {
      if (cancelled) throw Error('已停止');
      const current = pagination()?.textContent.trim().match(/^(\d+)\s*\//);
      if (current && +current[1] === expected) {
        let candidate = '';
        try { candidate = signature(); } catch {
          const section = [...document.querySelectorAll('.chapter-section')].find(visible);
          if (section && section.textContent.trim()) candidate = `unknown:${expected}:${section.textContent.trim()}`;
        }
        if (candidate && candidate === stable && Date.now() - since >= 1200) { log(`第${expected}页加载完成`); return true; }
        if (candidate !== stable) { stable = candidate; since = Date.now(); }
      } else { stable = ''; since = Date.now(); }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw Error('翻页或新题加载超时，已停止');
  }
  start.onclick = async () => {
    if (active) return;
    active = true; cancelled = false; start.disabled = true;
    setState('running');
    panel.style.background = 'white';
    try {
      while (true) {
        let skipping = false;
        try { await runCurrent(); }
        catch (error) {
          if (cancelled) throw error;
          submitWatch = null;
          if (/录音/.test(error.message) && document.querySelector('.oral-brief-course-do img[src$="/recording.gif"]')) throw error;
          pinError(`异常题已跳过：${error.message}`);
          skipping = true;
        }
        if (!autoNext.checked) {
          if (skipping) { setState('error'); say('异常已置顶；自动下一题未开启，已停止'); return; }
          break;
        }
        if (!(await advance(skipping))) break;
      }
      setState('done');
    } catch (error) {
      setState(cancelled ? 'stopped' : 'error');
      if (!cancelled) panel.style.background = '#ffe4ec';
      say(error.message); console.error('[新版填空]', error);
    } finally { active = false; submitWatch = null; start.disabled = false; }
  };
  stop.onclick = () => { cancelled = true; say('停止请求已发出；已提交的请求仍可能完成'); };
})();
