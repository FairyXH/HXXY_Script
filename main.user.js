// ==UserScript==
// @name         华夏系统增强工具
// @namespace    hxxy-enhancer
// @version      5.8.3
// @description  华夏系统增强工具
// @author     	 Zhang
// @license    	 MIT
// @match        https://me.hxxy.edu.cn/*
// @match        https://plat.hxxy.edu.cn/*
// @match        https://*.hxxy.edu.cn/*
// @connect      me.hxxy.edu.cn
// @connect      plat.hxxy.edu.cn
// @connect      *.hxxy.edu.cn
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// ==/UserScript==
(function () {
  'use strict';
  const VERSION = '5.8.0';
  const STORAGE_KEY = 'hxxy-enhancer-config-v3';
  const LOG_STORAGE_KEY = 'hxxy-enhancer-api-logs-v1';
  const EVENT_CONFIG = 'hxxy-enhancer-config';
  const EVENT_LOG = 'hxxy-enhancer-log';
  const EVENT_STATE = 'hxxy-enhancer-state';
  const INSTANCE_LOCK = '__HX_ENHANCER_INSTANCE__';
  const WATCHDOG_STORAGE_KEY = 'hxxy-enhancer-watchdog-v1';
  const WATCHDOG_TIMEOUT_MS = 3000;
  const TARGET_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 Edg/145.0.0.0';
  // Capture the real userscript environment before the optional page UA lock runs.
  const RUNTIME_ENVIRONMENT = (() => {
    const userAgent = navigator.userAgent || '';
    const platform = navigator.platform || '';
    const maxTouchPoints = Number(navigator.maxTouchPoints) || 0;
    const isIOS = /iPad|iPhone|iPod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
    return Object.freeze({
      userAgent,
      platform,
      vendor: navigator.vendor || '',
      language: navigator.language || '',
      maxTouchPoints,
      isIOS
    });
  })();
  const fieldsMap = {
    ClassCodes: '',
    counselorClzz: '0',
    classcode: '0',
    College: '0'
  };
  // ScriptCat may evaluate overlapping @match entries as separate instances.
  // Keep one owner per top window and let a stale owner expire naturally.
  const topWindow = window.top || window;
  const nowMs = () => Date.now();
  if (window.top === window.self) {
    try {
      const previous = topWindow[INSTANCE_LOCK];
      if (previous && previous.owner && nowMs() - previous.startedAt < 15000) return;
      topWindow[INSTANCE_LOCK] = { owner: Math.random().toString(36).slice(2), startedAt: nowMs() };
    } catch (e) {}
  }
  const defaultRules = [
    {
      id: 'builtin-check-info-activity',
      enabled: true,
      name: '(内置)解除综测活动未开始限制',
      mode: 'modifyResponse',
      match: { url: '/studentwork/HXAssessmentAppraise/CheckInfoActivity', regex: false },
      modify: { pattern: '("isok"\\s*:\\s*)false', replacement: '$1true', regex: true }
    },
    {
      id: 'builtin-Plat-App-info',
      enabled: true,
      name: '(内置)解除Plat应用访问限制',
      mode: 'modifyResponse',
      match: { url: '/QY/CheckMyApp', regex: false },
      modify: { pattern: '("isok"\\s*:\\s*)false', replacement: '$1true', regex: true }
    },
    {
      id: 'builtin-Assessment-timeout-activity',
      enabled: true,
      name: '(内置)解除综测申请过期限制',
      mode: 'modifyResponse',
      match: { url: '/studentwork/HXAssessmentActivity/actVerifyInfo', regex: false },
      modify: { pattern: '("isok"\\s*:\\s*)false', replacement: '$1true', regex: true }
    },
    {
      id: 'builtin-activity-year-zero',
      enabled: true,
      name: '(内置)综测总是加载全部活动',
      mode: 'modifyRequest',
      match: { url: '/studentwork/hxassessmentactivity/_activitypagelist', regex: false },
      modify: { pattern: '(^|&)Year=[^&]*', replacement: '$1Year=0', regex: true }
    },
    {
      id: 'builtin-verify-role-true',
      enabled: true,
      name: '(内置)解除学生活动审核限制',
      mode: 'replaceResponse',
      match: { url: '/studentwork/LessonActivityMobile/VerifyCurUserRole', regex: false },
      response: { lineEnabled: false, headersEnabled: false, bodyEnabled: true, body: 'true' }
    }
  ];
  function normalizeRule(rule) {
    if (!rule || typeof rule !== 'object') return null;
    if (rule.mode) {
      return Object.assign({
        enabled: true,
        match: { url: '', regex: false },
        request: { lineEnabled: false, headersEnabled: false, bodyEnabled: false, method: '', url: '', headers: '{}', body: '' },
        response: { lineEnabled: false, headersEnabled: false, bodyEnabled: false, status: 200, statusText: '', headers: '{}', body: '' },
        modify: { pattern: '', replacement: '', regex: true },
        redirect: { url: '' }
      }, rule, {
        match: Object.assign({ url: '', regex: false }, rule.match || {}),
        request: Object.assign({ lineEnabled: false, headersEnabled: false, bodyEnabled: false, method: '', url: '', headers: '{}', body: '' }, rule.request || {}),
        response: Object.assign({ lineEnabled: false, headersEnabled: false, bodyEnabled: false, method: '', url: '', headers: '{}', body: '' }, rule.response || {}),
        modify: Object.assign({ pattern: '', replacement: '', regex: true }, rule.modify || {}),
        redirect: Object.assign({ url: '' }, rule.redirect || {})
      });
    }
    const phase = rule.match && (rule.match.phase || rule.match.scope) || 'response';
    const action = rule.action || {};
    const migrated = Object.assign({}, rule, {
      mode: phase === 'request' ? 'modifyRequest' : 'modifyResponse',
      match: { url: rule.match && rule.match.value || '', regex: rule.match && rule.match.type === 'regex' },
      modify: {
        pattern: action.search || '',
        replacement: action.replace == null ? '' : String(action.replace),
        regex: !!action.regex
      }
    });
    if (action.type === 'json') migrated.legacyAction = { type: 'json', path: action.path, value: action.value };
    return migrated;
  }
  const defaultConfig = {
    hookEnabled: true,
    domPatchEnabled: true,
    apiEnabled: true,
    panelEnabled: true,
    logEnabled: true,
    maxLogs: 200,
    rules: defaultRules,
    savedApis: [],
    uaEnabled: true,
    autoConfig: {
      leave: true,
      activity: true,
      holiday: true,
      punch: true,
      interval: 30000,
      address: '',
      autoStartOnLoad: false
    }
  };
  const clone = value => JSON.parse(JSON.stringify(value));
  function loadConfig() {
    let saved = {};
    try {
      saved = GM_getValue(STORAGE_KEY, {}) || {};
    } catch (e) {
      console.warn('[Zhang华夏系统增强] 配置读取失败', e);
    }
    const savedRules = Array.isArray(saved.rules) ? saved.rules.map(normalizeRule).filter(Boolean) : [];
    const savedRuleById = new Map(savedRules.map(rule => [rule.id, rule]));
    const builtInRuleIds = new Set(defaultRules.map(rule => rule.id));
    const rules = clone(defaultRules).map(defaultRule => {
      const savedRule = savedRuleById.get(defaultRule.id);
      if (!savedRule) return defaultRule;
      return Object.assign({}, defaultRule, savedRule, {
        enabled: savedRule.enabled !== false,
        mode: defaultRule.mode,
        match: clone(defaultRule.match),
        request: Object.assign({}, defaultRule.request || {}, savedRule.request || {}),
        response: Object.assign({}, defaultRule.response || {}, savedRule.response || {}, defaultRule.response || {}),
        modify: Object.assign({}, defaultRule.modify || {}, savedRule.modify || {}),
        redirect: Object.assign({}, defaultRule.redirect || {}, savedRule.redirect || {})
      });
    }).concat(savedRules.filter(rule => !builtInRuleIds.has(rule.id)));
    return Object.assign({}, clone(defaultConfig), saved, {
      rules,
      savedApis: Array.isArray(saved.savedApis) ? saved.savedApis : [],
      uaEnabled: saved.uaEnabled !== false,
      autoConfig: Object.assign({}, clone(defaultConfig.autoConfig), saved.autoConfig || {})
    });
  }
  let config = loadConfig();
  const truncateLogText = (value, limit = 32768) => {
    const text = value == null ? '' : String(value);
    return text.length > limit ? text.slice(0, limit) + '\n...[已截断]' : text;
  };
  function loadPersistedLogs() {
    try {
      const saved = GM_getValue(LOG_STORAGE_KEY, []);
      if (!Array.isArray(saved)) return [];
      return saved.slice(0, Math.max(20, Number(config.maxLogs) || 200));
    } catch (e) {
      console.warn('[Zhang华夏系统增强] API日志读取失败', e);
      return [];
    }
  }
  function persistLogs() {
    try {
      const maxLogs = Math.max(20, Number(config.maxLogs) || 200);
      const persisted = logs.slice(0, maxLogs).map(entry => Object.assign({}, entry, {
        requestBody: truncateLogText(entry.requestBody),
        originalResponse: truncateLogText(entry.originalResponse),
        modifiedResponse: truncateLogText(entry.modifiedResponse)
      }));
      GM_setValue(LOG_STORAGE_KEY, persisted);
    } catch (e) {
      console.warn('[Zhang华夏系统增强] API日志保存失败', e);
    }
  }
  let logs = loadPersistedLogs();
  const seenLogEntries = new WeakSet();
  const recentLogKeys = new Map();
  function saveConfig() {
    try {
      GM_setValue(STORAGE_KEY, config);
    } catch (e) {
      console.warn('[Zhang华夏系统增强] 配置保存失败', e);
    }
  }
  function emitConfig() {
    const detail = {
      config: clone(config)
    };
    window.dispatchEvent(new CustomEvent(EVENT_CONFIG, {
      detail
    }));
    const broadcast = doc => {
      try {
        doc.querySelectorAll('iframe').forEach(frame => {
          const child = frame.contentWindow;
          if (child) child.dispatchEvent(new CustomEvent(EVENT_CONFIG, {
            detail
          }));
          if (frame.contentDocument) broadcast(frame.contentDocument);
        });
      } catch (e) {}
    };
    broadcast(document);
  }
  function localLog(level, ...args) {
    (console[level] || console.log).call(console, '[Zhang华夏系统增强]', ...args);
  }
  function addLog(entry) {
    if (!config.logEnabled || !entry) return;
    if (typeof entry === 'object') {
      if (seenLogEntries.has(entry)) return;
      seenLogEntries.add(entry);
    }
    const logKey = entry.id || [entry.method, entry.url, entry.status, entry.requestBody || '', entry.modified, (entry.matchedRules || []).join(',')].join('|');
    const now = Date.now();
    const previous = recentLogKeys.get(logKey);
    if (previous && now - previous < 1000) return;
    recentLogKeys.set(logKey, now);
    recentLogKeys.forEach((time, key) => {
      if (now - time > 5000) recentLogKeys.delete(key);
    });
    logs.unshift(entry);
    logs = logs.slice(0, Math.max(20, Number(config.maxLogs) || 200));
    persistLogs();
  }
  const patchedFields = new WeakMap();
  function patchField(el, fieldId, targetValue) {
    if (!el || !('value' in el) || el.value === targetValue) return;
    let patched = patchedFields.get(el);
    if (!patched) {
      patched = new Map();
      patchedFields.set(el, patched);
    }
    if (patched.get(fieldId) === targetValue) return;
    // Mark before dispatching events because page handlers can synchronously restore the value.
    patched.set(fieldId, targetValue);
    el.value = targetValue;
    el.setAttribute('value', targetValue);
    try {
      el.dispatchEvent(new Event('input', {
        bubbles: true
      }));
      el.dispatchEvent(new Event('change', {
        bubbles: true
      }));
    } catch (e) {}
    localLog('log', `字段 ${fieldId} 已修改为 "${targetValue}"`);
  }
  function patchAssessmentRankingToolbar(doc) {
    if (!doc || !doc.defaultView) return;
    let pageUrl = '';
    try {
      pageUrl = doc.defaultView.location.href || '';
    } catch (e) {
      return;
    }
    if (pageUrl.indexOf('https://me.hxxy.edu.cn/studentwork/HXAssessmentRanking') === -1) return;
    let toolbar;
    try {
      toolbar = doc.evaluate(
        '/html/body/div[3]/div[2]/div/div/div/form/div/div[8]',
        doc,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      ).singleNodeValue;
    } catch (e) {
      return;
    }
    if (!toolbar || toolbar.nodeType !== 1) return;
    const addToolButton = (action, text) => {
      const marker = `data-hxxy-action-${action}`;
      if (toolbar.querySelector(`[${marker}]`)) return;
      const button = doc.createElement('button');
      button.id = 'tool-add';
      button.setAttribute('onclick', `${action}(value)`);
      button.className = 'btn btn-sm btn-info';
      button.type = 'button';
      button.setAttribute(marker, '1');
      const icon = doc.createElement('i');
      icon.className = 'fa fa-clone';
      button.appendChild(icon);
      button.appendChild(doc.createTextNode(text));
      toolbar.appendChild(button);
    };
    addToolButton('batchstu', '批量审批');
    addToolButton('batchdel', '批量删除');
  }
  function patchDocument(doc, root = doc) {
    if (!config.domPatchEnabled || !doc || !root) return;
    patchAssessmentRankingToolbar(doc);
    for (const [fieldId, targetValue] of Object.entries(fieldsMap)) {
      let nodes = [];
      try {
        const selector = `#${CSS.escape(fieldId)}, [id="${fieldId}"], .${CSS.escape(fieldId)}`;
        if (root.nodeType === 1 && root.matches(selector)) nodes = [root];
        if (root.querySelectorAll) nodes.push(...root.querySelectorAll(selector));
      } catch (e) {
        const selector = `[id="${fieldId}"], .${fieldId}`;
        if (root.nodeType === 1 && root.matches && root.matches(selector)) nodes = [root];
        if (root.querySelectorAll) nodes.push(...root.querySelectorAll(selector));
      }
      nodes.forEach(el => patchField(el, fieldId, targetValue));
    }
  }
  const observedDocs = new WeakSet();
  function injectUserAgentIntoDocument(doc) {
    if (!config.uaEnabled || !doc) return;
    const win = doc.defaultView;
    if (!win || win.__HX_ENHANCER_UA_LOCKED__) return;
    const parent = doc.documentElement || doc.head || doc.body;
    if (!parent) return;
    const script = doc.createElement('script');
    script.textContent = `(() => {
      'use strict';
      if (window.__HX_ENHANCER_UA_LOCKED__) return;
      const target = ${JSON.stringify(TARGET_USER_AGENT)};
      const define = (key, value) => {
        try {
          Object.defineProperty(navigator, key, { configurable: true, get: () => value });
        } catch (e) {}
      };
      define('userAgent', target);
      define('appVersion', target.replace('Mozilla/5.0 ', ''));
      define('platform', 'Win32');
      define('vendor', 'Google Inc.');
      define('productSub', '20030107');
      define('maxTouchPoints', 0);
      try {
        Object.defineProperty(navigator, 'userAgentData', {
          configurable: true,
          get: () => ({
            brands: [
              { brand: 'Not:A-Brand', version: '99' },
              { brand: 'Microsoft Edge', version: '145' },
              { brand: 'Chromium', version: '145' }
            ],
            mobile: false,
            platform: 'Windows',
            getHighEntropyValues: async () => ({
              architecture: 'x86',
              bitness: '64',
              mobile: false,
              model: '',
              platform: 'Windows',
              platformVersion: '10.0.0',
              uaFullVersion: '145.0.0.0'
            })
          })
        });
      } catch (e) {}
      window.__HX_ENHANCER_UA_LOCKED__ = true;
    })();`;
    parent.appendChild(script);
    script.remove();
  }
  function injectPageHookIntoDocument(doc) {
    if (!config.hookEnabled || !config.apiEnabled || !doc) return;
    const win = doc.defaultView;
    if (!win || win.__HX_ENHANCER_PAGE_HOOK__) return;
    const parent = doc.documentElement || doc.head || doc.body;
    if (!parent) return;
    const script = doc.createElement('script');
    script.textContent = pageHookSource(config);
    parent.appendChild(script);
    script.remove();
  }
  function bridgeFrameEvents(doc) {
    const win = doc && doc.defaultView;
    if (!win || win === window || win.__HX_ENHANCER_EVENT_BRIDGE__) return;
    win.__HX_ENHANCER_EVENT_BRIDGE__ = true;
    win.addEventListener(EVENT_LOG, event => {
      window.dispatchEvent(new CustomEvent(EVENT_LOG, {
        detail: event.detail
      }));
    });
  }
  function observeDocument(doc) {
    if (!doc || observedDocs.has(doc)) return;
    observedDocs.add(doc);
    patchDocument(doc);
    injectUserAgentIntoDocument(doc);
    injectPageHookIntoDocument(doc);
    bridgeFrameEvents(doc);
    const root = doc.documentElement || doc;
    if (typeof MutationObserver !== 'undefined') {
      const observer = new MutationObserver(mutations => mutations.forEach(mutation => {
        if (mutation.type === 'attributes') {
          patchDocument(doc, mutation.target);
          return;
        }
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) patchDocument(doc, node);
        });
      }));
      observer.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['id', 'class']
      });
    }
    doc.querySelectorAll('iframe').forEach(bindFrame);
  }
  function bindFrame(frame) {
    if (!frame || frame.__HX_ENHANCER_BOUND__) return;
    frame.__HX_ENHANCER_BOUND__ = true;
    const load = () => {
      try {
        if (frame.contentDocument) observeDocument(frame.contentDocument);
      } catch (e) {}
    };
    frame.addEventListener('load', load);
    load();
  }
  function startWatchdog() {
    if (window.top !== window.self) return;
    let recoveryScheduled = false;
    let lastTick = performance.now();
    const scheduleRecovery = reason => {
      if (recoveryScheduled) return;
      recoveryScheduled = true;
      const stamp = String(Date.now());
      try {
        const previous = sessionStorage.getItem(WATCHDOG_STORAGE_KEY);
        if (previous && Date.now() - Number(previous) < 15000) {
          localLog('warn', '检测到重复卡顿恢复，停止连续刷新', reason);
          return;
        }
        sessionStorage.setItem(WATCHDOG_STORAGE_KEY, stamp);
      } catch (e) {}
      localLog('warn', `页面连续无响应超过 ${WATCHDOG_TIMEOUT_MS}ms，准备刷新恢复`, reason);
      const recover = () => {
        try { window.stop(); } catch (e) {}
        window.location.reload();
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', recover, { once: true });
      else setTimeout(recover, 0);
    };
    const workerSource = `setInterval(() => postMessage({ type: 'heartbeat', sentAt: Date.now() }), 500);`;
    try {
      const blob = new Blob([workerSource], { type: 'text/javascript' });
      const worker = new Worker(URL.createObjectURL(blob));
      worker.onmessage = event => {
        if (!event.data) return;
        if (event.data.type === 'heartbeat') {
          const delay = Date.now() - Number(event.data.sentAt || Date.now());
          if (delay >= WATCHDOG_TIMEOUT_MS) scheduleRecovery(`主线程消息延迟约 ${delay}ms`);
        }
      };
      window.addEventListener('beforeunload', () => worker.terminate(), { once: true });
    } catch (e) {
      localLog('warn', 'Worker看门狗启动失败，使用主线程长任务监测', e);
    }
    if (typeof PerformanceObserver !== 'undefined') {
      try {
        const observer = new PerformanceObserver(list => list.getEntries().forEach(entry => {
          if (entry.duration >= WATCHDOG_TIMEOUT_MS) scheduleRecovery(`Long Task ${Math.round(entry.duration)}ms`);
        }));
        observer.observe({ type: 'longtask', buffered: true });
      } catch (e) {}
    }
    const heartbeat = () => {
      const current = performance.now();
      if (current - lastTick >= WATCHDOG_TIMEOUT_MS) scheduleRecovery(`心跳间隔 ${Math.round(current - lastTick)}ms`);
      lastTick = current;
      setTimeout(heartbeat, 500);
    };
    setTimeout(heartbeat, 500);
  }
  function startDomPatch() {
    const start = () => {
      if (!document.documentElement) return false;
      observeDocument(document);
      const observer = new MutationObserver(mutations => mutations.forEach(m => m.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        if (node.matches && node.matches('iframe')) bindFrame(node);
        if (node.querySelectorAll) node.querySelectorAll('iframe').forEach(bindFrame);
      })));
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
      return true;
    };
    if (!start()) document.addEventListener('DOMContentLoaded', start, {
      once: true
    });
  }
  function pageHookSource(initialConfig) {
    return `(${function (EVENT_CONFIG, EVENT_LOG, EVENT_STATE, initialConfig) {
            'use strict';
            if (window.__HX_ENHANCER_PAGE_HOOK__) return;
            window.__HX_ENHANCER_PAGE_HOOK__ = true;
            let state = { config: initialConfig };
            const nativeOpen = XMLHttpRequest.prototype.open;
            const nativeSend = XMLHttpRequest.prototype.send;
            const nativeFetch = window.fetch;
            const nativeResponseDescriptor = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'response');
            const nativeResponseTextDescriptor = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'responseText');
            if (nativeResponseDescriptor && nativeResponseDescriptor.get && nativeResponseDescriptor.configurable) {
                try {
                    Object.defineProperty(XMLHttpRequest.prototype, 'response', {
                        configurable: nativeResponseDescriptor.configurable,
                        enumerable: nativeResponseDescriptor.enumerable,
                        get() { return Object.prototype.hasOwnProperty.call(this, '__HX_RESPONSE_OVERRIDE__') ? this.__HX_RESPONSE_OVERRIDE__ : nativeResponseDescriptor.get.call(this); }
                    });
                } catch (e) {}
            }
            if (nativeResponseTextDescriptor && nativeResponseTextDescriptor.get && nativeResponseTextDescriptor.configurable) {
                try {
                    Object.defineProperty(XMLHttpRequest.prototype, 'responseText', {
                        configurable: nativeResponseTextDescriptor.configurable,
                        enumerable: nativeResponseTextDescriptor.enumerable,
                        get() { return Object.prototype.hasOwnProperty.call(this, '__HX_RESPONSE_TEXT_OVERRIDE__') ? this.__HX_RESPONSE_TEXT_OVERRIDE__ : nativeResponseTextDescriptor.get.call(this); }
                    });
                } catch (e) {}
            }
            const now = () => performance && performance.now ? performance.now() : Date.now();
            const getUrl = input => typeof input === 'string' ? input : (input && input.url ? input.url : String(input || ''));
            function matches(rule, url) {
                if (!rule || !rule.enabled || !rule.match || !rule.match.url) return false;
                try {
                    return rule.match.regex ? new RegExp(rule.match.url).test(url) : url.indexOf(String(rule.match.url)) >= 0;
                } catch (e) { return false; }
            }
            function applyText(text, rule) {
                if (!rule || !rule.modify || !rule.modify.pattern) return { text, modified: false };
                try {
                    const next = rule.modify.regex ? text.replace(new RegExp(rule.modify.pattern, 'g'), String(rule.modify.replacement == null ? '' : rule.modify.replacement)) : text.split(rule.modify.pattern).join(String(rule.modify.replacement == null ? '' : rule.modify.replacement));
                    return { text: next, modified: next !== text };
                } catch (e) { return { text, modified: false }; }
            }
            function applyLegacyJson(text, rule) {
                if (!rule.legacyAction || rule.legacyAction.type !== 'json') return { text, modified: false };
                try {
                    const data = JSON.parse(text);
                    const parts = String(rule.legacyAction.path || '').replace(/^\\$\\.?/, '').split('.').filter(Boolean);
                    if (!parts.length) return { text, modified: false };
                    let cursor = data;
                    for (let i = 0; i < parts.length - 1; i += 1) { if (!cursor || typeof cursor !== 'object') return { text, modified: false }; cursor = cursor[parts[i]]; }
                    if (!cursor || typeof cursor !== 'object') return { text, modified: false };
                    cursor[parts[parts.length - 1]] = rule.legacyAction.value;
                    const next = JSON.stringify(data);
                    return { text: next, modified: next !== text };
                } catch (e) { return { text, modified: false }; }
            }
            function modifyBody(url, originalText, phase) {
                if (!state.config.apiEnabled || typeof originalText !== 'string') return { text: originalText, modified: false, matchedRules: [] };
                let text = originalText; let modified = false; const matchedRules = [];
                (state.config.rules || []).forEach(rule => {
                    const expectedMode = phase === 'request' ? 'modifyRequest' : 'modifyResponse';
                    if (!matches(rule, url) || rule.mode !== expectedMode) return;
                    matchedRules.push(rule.name || rule.id || 'unnamed');
                    const result = rule.legacyAction ? applyLegacyJson(text, rule) : applyText(text, rule);
                    if (result.modified) { text = result.text; modified = true; }
                    if (phase === 'response' && rule.mode === 'replaceResponse' && rule.response && rule.response.bodyEnabled) { text = String(rule.response.body == null ? '' : rule.response.body); modified = text !== originalText; }
                });
                return { text, modified, matchedRules };
            }
            function patchXhrResponse(xhr, responseType, text) {
                try {
                    if (responseType === 'json') {
                        xhr.__HX_RESPONSE_OVERRIDE__ = JSON.parse(text);
                    } else {
                        xhr.__HX_RESPONSE_TEXT_OVERRIDE__ = text;
                        xhr.__HX_RESPONSE_OVERRIDE__ = text;
                    }
                    return true;
                } catch (e) {
                    return false;
                }
            }
            function parseHeaderObject(value) {
                try { return value && typeof value === 'object' ? value : JSON.parse(value || '{}'); } catch (e) { return {}; }
            }
            function applyRequestHeaders(url, headers) {
                let next;
                const matchedRules = [];
                try {
                    next = new Headers(headers || {});
                } catch (e) {
                    return { headers: new Map(), modified: false, matchedRules: [] };
                }
                (state.config.rules || []).forEach(rule => {
                    if (!rule.enabled || !matches(rule, url) || rule.mode !== 'replaceRequest' || !rule.request || !rule.request.headersEnabled) return;
                    matchedRules.push(rule.name || rule.id || 'unnamed');
                    const replacement = parseHeaderObject(rule.request.headers);
                    Object.keys(replacement).forEach(key => { try { next.set(key, String(replacement[key])); } catch (e) {} });
                });
                return { headers: next, modified: matchedRules.length > 0, matchedRules };
            }
            function applyResponseHeaders(url, headers) {
                const next = new Headers(headers || {}); const matchedRules = [];
                (state.config.rules || []).forEach(rule => {
                    if (!rule.enabled || !matches(rule, url) || rule.mode !== 'replaceResponse' || !rule.response || !rule.response.headersEnabled) return;
                    matchedRules.push(rule.name || rule.id || 'unnamed');
                    const replacement = parseHeaderObject(rule.response.headers);
                    Object.keys(replacement).forEach(key => { try { next.set(key, String(replacement[key])); } catch (e) {} });
                });
                return { headers: next, modified: matchedRules.length > 0, matchedRules };
            }
            function transformRequest(url, method, body, headers) {
                let nextUrl = url; let nextMethod = method; let nextBody = body; let nextHeaders = headers || {}; let modified = false; const matchedRules = [];
                (state.config.rules || []).forEach(rule => {
                    if (!rule.enabled || !matches(rule, nextUrl)) return;
                    if (rule.mode === 'redirect' && rule.redirect && rule.redirect.url) {
                        nextUrl = rule.redirect.url;
                        modified = true;
                        matchedRules.push(rule.name || rule.id || 'unnamed');
                        return;
                    }
                    if (rule.mode !== 'replaceRequest') return;
                    matchedRules.push(rule.name || rule.id || 'unnamed');
                    const request = rule.request || {};
                    if (request.lineEnabled) { if (request.method) nextMethod = request.method; if (request.url) nextUrl = request.url; modified = true; }
                    if (request.bodyEnabled && typeof nextBody === 'string') { nextBody = String(request.body == null ? '' : request.body); modified = true; }
                });
                const headerResult = applyRequestHeaders(nextUrl, nextHeaders);
                const bodyResult = modifyBody(nextUrl, nextBody, 'request');
                return { url: nextUrl, method: nextMethod, body: bodyResult.text, headers: headerResult.headers, modified: modified || bodyResult.modified || headerResult.matchedRules.length > 0, matchedRules: matchedRules.concat(headerResult.matchedRules, bodyResult.matchedRules) };
            }
            function transformResponse(url, originalText) {
                const result = modifyBody(url, originalText, 'response');
                let text = result.text; let modified = result.modified; const matchedRules = result.matchedRules.slice();
                (state.config.rules || []).forEach(rule => {
                    if (!rule.enabled || !matches(rule, url) || rule.mode !== 'replaceResponse') return;
                    const response = rule.response || {};
                    if (!response.bodyEnabled) return;
                    matchedRules.push(rule.name || rule.id || 'unnamed');
                    text = String(response.body == null ? '' : response.body); modified = text !== originalText;
                });
                return { text, modified, matchedRules };
            }
            function sendLog(start, method, url, status, originalText, result, requestBody, requestResult) {
                if (!state.config.logEnabled) return;
                const requestMatchedRules = requestResult && requestResult.matchedRules ? requestResult.matchedRules : [];
                window.dispatchEvent(new CustomEvent(EVENT_LOG, {
                    detail: {
                        id: `
    $ {
      Date.now()
    } - $ {
      Math.random().toString(36).slice(2)
    }
    `,
                        time: new Date().toLocaleTimeString(), timestamp: Date.now(), method: method || 'GET', url,
                        status: status == null ? 0 : status, duration: Math.round(now() - start), modified: !!result.modified || !!(requestResult && requestResult.modified),
                        matchedRules: requestMatchedRules.concat(result.matchedRules || []), requestBody: requestBody == null ? '' : String(requestBody),
                        originalResponse: originalText, modifiedResponse: result.text
                    }
                }));
            }
            // 老式 PHP（如 m.hxxy.edu.cn）常用表单/iframe 提交而非 XHR，这里补抓表单请求
            function serializeForm(form) {
                const parts = [];
                try {
                    if (form && form.elements) {
                        Array.prototype.forEach.call(form.elements, el => {
                            if (!el || !el.name || el.disabled) return;
                            const type = String(el.type || '').toLowerCase();
                            if (type === 'submit' || type === 'button' || type === 'reset' || type === 'file') return;
                            if (type === 'checkbox' || type === 'radio') {
                                if (el.checked) parts.push([el.name, el.value == null ? 'on' : el.value]);
                                return;
                            }
                            if (el.multiple && el.selectedOptions) {
                                Array.prototype.forEach.call(el.selectedOptions, option => parts.push([el.name, option.value]));
                                return;
                            }
                            parts.push([el.name, el.value == null ? '' : el.value]);
                        });
                    }
                } catch (e) {}
                return parts.map(pair => encodeURIComponent(pair[0]) + '=' + encodeURIComponent(pair[1])).join('&');
            }
            function logFormSubmit(form, trigger) {
                try {
                    if (!state.config.logEnabled || !form) return;
                    let action = form.action || (window.location && window.location.href) || '';
                    try { action = new URL(action, (window.location && window.location.href) || undefined).href; } catch (e) {}
                    const method = String(form.method || 'GET').toUpperCase();
                    const body = serializeForm(form);
                    const url = method === 'GET' && body ? action + (action.indexOf('?') >= 0 ? '&' : '?') + body : action;
                    window.dispatchEvent(new CustomEvent(EVENT_LOG, {
                        detail: {
                            id: 'form-' + Date.now() + '-' + Math.random().toString(36).slice(2),
                            time: new Date().toLocaleTimeString(), timestamp: Date.now(),
                            method, url, status: 0, duration: 0, modified: false, matchedRules: [],
                            requestBody: method === 'POST' ? body : '',
                            originalResponse: '', modifiedResponse: '',
                            isForm: true, formTrigger: trigger || 'submit'
                        }
                    }));
                } catch (e) { console.warn('[Zhang华夏系统增强] 表单日志失败', e); }
            }
            try {
                document.addEventListener('submit', event => {
                    const form = event.target && event.target.tagName === 'FORM' ? event.target : null;
                    if (form) logFormSubmit(form, 'submit-event');
                }, true);
            } catch (e) {}
            const nativeFormSubmit = HTMLFormElement.prototype.submit;
            if (typeof nativeFormSubmit === 'function') {
                HTMLFormElement.prototype.submit = function () {
                    try { logFormSubmit(this, 'submit-call'); } catch (e) {}
                    return nativeFormSubmit.apply(this, arguments);
                };
            }
            function processXhrResponse(xhr, meta) {
                if (xhr.readyState !== 4 || meta.done) return;
                meta.done = true;
                try {
                    const responseType = xhr.responseType || 'text';
                    const nativeResponse = responseType === 'json' ? xhr.response : null;
                    const documentText = responseType === 'document' && xhr.responseXML ? new XMLSerializer().serializeToString(xhr.responseXML) : '';
                    const originalText = responseType === 'json' ? (nativeResponse == null ? '' : JSON.stringify(nativeResponse)) : (responseType === 'text' || responseType === '' ? xhr.responseText : documentText);
                    const result = transformResponse(meta.url, originalText);
                    if (result.modified && responseType !== 'document' && responseType !== 'arraybuffer' && responseType !== 'blob') {
                        if (!patchXhrResponse(xhr, responseType, result.text)) console.warn('[Zhang华夏系统增强] XHR响应回写失败');
                    }
                    sendLog(meta.start, meta.method, meta.url, xhr.status, originalText, result, meta.requestBody, meta.requestResult);
                } catch (e) { console.warn('[Zhang华夏系统增强] XHR处理失败', e); }
            }
            XMLHttpRequest.prototype.open = function (method, url) {
                const transformed = transformRequest(getUrl(url), method || 'GET', '', {});
                this.__HX_META__ = { method: transformed.method || method || 'GET', url: transformed.url, start: 0, done: false, requestHeaders: {}, requestHeaderResult: transformed };
                const xhr = this;
                const meta = this.__HX_META__;
                xhr.addEventListener('readystatechange', () => processXhrResponse(xhr, meta), false);
                xhr.addEventListener('load', () => processXhrResponse(xhr, meta), false);
                return nativeOpen.call(this, transformed.method || method, transformed.url, ...Array.prototype.slice.call(arguments, 2));
            };
            const nativeSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
            XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
                const meta = this.__HX_META__;
                if (meta) {
                    meta.requestHeaders[name] = value;
                    if (meta.requestHeaderResult && meta.requestHeaderResult.headers) {
                        const replacement = meta.requestHeaderResult.headers.get(name);
                        if (replacement != null) value = replacement;
                    }
                }
                return nativeSetRequestHeader.call(this, name, value);
            };
            XMLHttpRequest.prototype.send = function () {
                const xhr = this; const meta = xhr.__HX_META__ || { method: 'GET', url: '', done: false }; meta.start = now();
                const originalBody = arguments[0];
                const requestResult = typeof originalBody === 'string' ? transformRequest(meta.url, meta.method, originalBody) : { url: meta.url, method: meta.method, body: originalBody, modified: false, matchedRules: [] };
                meta.requestResult = requestResult;
                meta.requestBody = requestResult.body == null ? '' : requestResult.body;
                if (requestResult.headers) requestResult.headers.forEach((value, name) => {
                    if (!Object.prototype.hasOwnProperty.call(meta.requestHeaders, name)) {
                        try { nativeSetRequestHeader.call(xhr, name, value); } catch (e) {}
                    }
                });
                const sendArgs = requestResult.modified ? [requestResult.body] : arguments;
                return nativeSend.apply(this, sendArgs);
            };
            window.fetch = function () {
                const args = Array.prototype.slice.call(arguments); const input = args[0]; const init = Object.assign({}, args[1] || {});
                const originalUrl = getUrl(input); const originalMethod = init.method || (input && input.method) || 'GET'; const originalBody = init.body;
                const requestHeaders = new Headers(init.headers || (input && input.headers) || {});
                const requestResult = transformRequest(originalUrl, originalMethod, originalBody, requestHeaders);
                const start = now();
                if (requestResult.url !== originalUrl || requestResult.method !== originalMethod) {
                    if (input instanceof Request) args[0] = new Request(requestResult.url, { method: requestResult.method, headers: requestResult.headers, body: requestResult.body, credentials: input.credentials, mode: input.mode, cache: input.cache, redirect: input.redirect, referrer: input.referrer, referrerPolicy: input.referrerPolicy, integrity: input.integrity });
                    else { args[0] = requestResult.url; init.method = requestResult.method; init.body = requestResult.body; init.headers = requestResult.headers; }
                } else if (requestResult.modified) { init.body = requestResult.body; init.headers = requestResult.headers; }
                args[1] = init;
                return nativeFetch.apply(this, args).then(async response => {
                    try {
                        const originalText = await response.clone().text(); const result = transformResponse(requestResult.url, originalText);
                        sendLog(start, requestResult.method, requestResult.url, response.status, originalText, result, requestResult.body || '', requestResult);
                        const headerResult = applyResponseHeaders(requestResult.url, response.headers);
                        if (!result.modified && !headerResult.modified) return response;
                        headerResult.headers.delete('content-length');
                        return new Response(result.text, { status: response.status, statusText: response.statusText, headers: headerResult.headers });
                    } catch (e) { console.warn('[Zhang华夏系统增强] fetch处理失败', e); return response; }
                });
            };
            window.addEventListener(EVENT_CONFIG, event => { if (event.detail && event.detail.config) state.config = event.detail.config; });
            window.dispatchEvent(new CustomEvent(EVENT_STATE, { detail: { hooked: true } }));
        }.toString()})(${JSON.stringify(EVENT_CONFIG)}, ${JSON.stringify(EVENT_LOG)}, ${JSON.stringify(EVENT_STATE)}, ${JSON.stringify(initialConfig)});`;
  }
  function formatResponse(text) {
    if (!text) return '';
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch (e) {
      return text;
    }
  }
  function parseHeaders(text) {
    try {
      return JSON.parse(text || '{}');
    } catch (e) {
      return null;
    }
  }
  function detectBodyType(body) {
    return /(^|&)\w+=[^&]*/.test(body) && !/^\s*[\[{]/.test(body);
  }
  function parseRawBody(body) {
    const params = new URLSearchParams();
    body.split('&').forEach(part => {
      if (!part) return;
      const i = part.indexOf('=');
      const key = i < 0 ? part : part.slice(0, i);
      const value = i < 0 ? '' : part.slice(i + 1);
      params.append(decodeURIComponent(key.replace(/\+/g, ' ')), decodeURIComponent(value.replace(/\+/g, ' ')));
    });
    return params;
  }
  function normalizeBody(body, headers) {
    if (!body) return {
      body: '',
      headers
    };
    const nextHeaders = Object.assign({}, headers);
    if (detectBodyType(body) && !Object.keys(nextHeaders).some(k => k.toLowerCase() === 'content-type')) nextHeaders['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
    if (detectBodyType(body)) return {
      body: parseRawBody(body),
      headers: nextHeaders
    };
    return {
      body,
      headers: nextHeaders
    };
  }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    } [ch]));
  }
  function setInput(container, id, value) {
    const el = container.querySelector('#' + id);
    if (el) el.value = value == null ? '' : value;
  }
  const pythonApiCatalog = [
    {name:'请假记录', method:'POST', path:'/studentwork/VApply/GetVList', body:{page:1,rows:1000,askLeaveStatus:-10}},
    {name:'提交销假', method:'POST', path:'/studentwork/VApply/SubmitSignin', body:{id:'',address:''}, write:true},
    {name:'晚寝活动列表', method:'POST', path:'/studentwork/PunchMStudent/GetActivityList', body:{page:1,size:1000}},
    {name:'返校确认', method:'POST', path:'/studentwork/vHStudent/SubmitSignin', body:{id:'',address:'',longitudeGaoDe:'',latitudeGaoDe:''}, write:true},
  ];
  function renderPythonApiCatalog(container, context) {
    const domainFor = item => item.domain === 'plat' ? 'https://plat.hxxy.edu.cn' : 'https://me.hxxy.edu.cn';
    container.innerHTML = `<div class="tool-head"><button class="secondary tool-back">返回工具箱</button><h4>移植接口目录</h4></div><label>接口<select id="pythonApiSelect"></select></label><div id="pythonApiNote"></div><label>接口<input id="pythonApiUrl"></label><label>类型<select id="pythonApiMethod"><option>GET</option><option>POST</option></select></label><label>数据<textarea id="pythonApiBody" rows="8"></textarea></label><div class="actions"><button id="pythonApiSend">发送请求</button><button class="secondary" id="pythonApiSave">保存为API</button></div><pre id="pythonApiResult">请选择接口</pre>`;
    container.querySelector('.tool-back').onclick = context.back;
    const select = container.querySelector('#pythonApiSelect');
    pythonApiCatalog.forEach((item, index) => {
      const option = document.createElement('option');
      option.value = index;
      option.textContent = `${item.domain === 'plat' ? 'plat' : 'me'} · ${item.name}${item.write ? ' · 写入' : ''}`;
      select.appendChild(option);
    });
    const fill = () => {
      const item = pythonApiCatalog[Number(select.value)];
      container.querySelector('#pythonApiUrl').value = domainFor(item) + item.path;
      container.querySelector('#pythonApiMethod').value = item.method;
      container.querySelector('#pythonApiBody').value = JSON.stringify(item.body || {}, null, 2);
      container.querySelector('#pythonApiNote').textContent = (item.write ? '写入接口：请确认参数和账号权限后再发送。' : '查询接口') + (item.note ? ` ${item.note}` : '');
    };
    select.onchange = fill;
    fill();
    container.querySelector('#pythonApiSend').onclick = async () => {
    const result = container.querySelector('#pythonApiResult');
    const method = container.querySelector('#pythonApiMethod').value;
    const item = pythonApiCatalog[Number(select.value)];
    if (item.write && !confirm(`这是写入接口：${item.name}\n确认使用当前登录身份发送？`)) return;
    let bodyText = container.querySelector('#pythonApiBody').value.trim();
    let body = bodyText;
    if (bodyText) {
      try {
        const parsed = JSON.parse(bodyText);
        body = method === 'GET' ? undefined : new URLSearchParams(Object.entries(parsed).map(([key, value]) => [key, value == null ? '' : String(value)])).toString();
      } catch (e) { body = bodyText; }
    }
    let requestUrl = container.querySelector('#pythonApiUrl').value.trim();
    if (method === 'GET' && bodyText) {
      try {
        const parsed = JSON.parse(bodyText);
        const url = new URL(requestUrl, window.location.href);
        Object.entries(parsed).forEach(([key, value]) => url.searchParams.set(key, value == null ? '' : String(value)));
        requestUrl = url.href;
      } catch (e) {
        requestUrl += (requestUrl.indexOf('?') >= 0 ? '&' : '?') + bodyText;
      }
    }
    result.textContent = '正在请求...';
    const response = await context.request({method, url:requestUrl, headers:{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8'}, body:method === 'GET' ? undefined : body});
    context.showResult(result, response);
    };
    container.querySelector('#pythonApiSave').onclick = () => {
      const item = pythonApiCatalog[Number(select.value)];
      config.savedApis.push({id:'api-python-' + Date.now(), name:'Python-' + item.name, method:container.querySelector('#pythonApiMethod').value, url:container.querySelector('#pythonApiUrl').value, headers:'{"Content-Type":"application/x-www-form-urlencoded; charset=UTF-8"}', body:container.querySelector('#pythonApiBody').value});
      saveConfig();
      container.querySelector('#pythonApiResult').textContent = '已保存到 API调试。';
    };
  }
  // 工具箱注册表：新增工具时只需增加一个 { id, name, description, render } 项。
  // render(container, context) 可自行创建独立界面；context 统一提供 request、showResult 与 back。
  const toolboxTools = [
    {
      id: 'python-api-catalog',
      name: '(学工系统)移植接口',
      description: '移植自动化中的已知接口，支持参数编辑、查询和保存。',
      render: renderPythonApiCatalog
    },
    //一键销假功能
    {
      id: 'leave-list',
      name: '(学工系统)请假销假',
      description: '查询当前请假记录并支持直接销假。',
      render(container, context) {
        container.innerHTML = `<div class="tool-head"><button class="secondary tool-back">返回工具箱</button><h4>请假列表</h4></div><div class="actions"><button id="loadLeaveList">查询请假记录</button></div><div id="leaveResult">等待查询</div>`;
        container.querySelector('.tool-back').onclick = context.back;
        const result = container.querySelector('#leaveResult');
        const style = document.createElement('style');
        style.textContent = `
          .leave-list{display:flex;flex-direction:column;gap:8px;font-size:12px}
          .leave-card{border:1px solid #cbd5e1;border-radius:9px;padding:10px;background:#f8fafc}
          .leave-header{margin-bottom:5px}
          .leave-name{font-size:14px;font-weight:600;color:#0f172a}
          .leave-id{display:block;margin-top:3px;color:#64748b;font-size:11px}
          .leave-time{color:#475569;line-height:1.6;word-break:break-word}
          .leave-time .label{display:inline-block;width:48px;color:#64748b}
          .leave-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:5px;margin-top:8px}
          .leave-actions button{font-size:11px;padding:4px 9px}
          .leave-operation-result{min-height:18px;margin-top:7px;color:#334155;white-space:pre-wrap;word-break:break-word}
        `;
        container.appendChild(style);
        async function load() {
          result.textContent = '正在查询...';
          try {
            const response = await context.request({
              method: 'POST',
              url: 'https://plat.hxxy.edu.cn/studentwork/VApply/GetVList',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
              },
              body: new URLSearchParams({
                key: '',
                page: '1',
                rows: '1000',
                askLeaveStatus: '-10'
              }).toString()
            });
            const json = JSON.parse(response.text);
            const data = json.data;
            if (!Array.isArray(data) || data.length === 0) {
              result.innerHTML = `<div>暂无请假记录</div><details><summary>查看原始返回</summary><pre>${JSON.stringify(json, null, 2)}</pre></details>`;
              return
            }
            let html = `<div class="leave-list">`;
            data.forEach(item => {
              html += `<div class="leave-card"><div class="leave-header"><div class="leave-name">${item.name ?? '请假记录'}</div><span class="leave-id">请假 ID：${item.id ?? ''}</span></div><div class="leave-time"><div><span class="label">开始：</span>${item.starttime ?? ''}</div><div><span class="label">结束：</span>${item.endtime ?? ''}</div></div><div class="leave-actions"><button class="cancel-btn" data-id="${item.id}" data-address="${item.cancelplace ?? ''}">销假</button></div><div class="leave-operation-result" id="leave-result-${item.id}"></div></div>`;
            });
            html += `</div>`;
            result.innerHTML = html;
            container.querySelectorAll('.cancel-btn').forEach(btn => {
              btn.onclick = async () => {
                const id = btn.dataset.id;
                const resultBox = container.querySelector(`#leave-result-${id}`);
                const setOperationResult = message => {
                  if (resultBox) resultBox.textContent = message;
                };
                const address = btn.dataset.address || prompt('请输入销假地址');
                if (!address) {
                  setOperationResult('已取消');
                  return;
                }
                btn.disabled = true;
                btn.textContent = '提交中...';
                setOperationResult('正在提交...');
                try {
                  const response = await context.request({
                  method: 'POST',
                  url: 'https://plat.hxxy.edu.cn/studentwork/VApply/SubmitSignin',
                  headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                  },
                  body: new URLSearchParams({
                    id,
                    address
                  }).toString()
                  });
                  if (response.error) {
                    setOperationResult(`销假失败：${response.error}`);
                  } else if (!response.ok) {
                    setOperationResult(`销假失败：HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`);
                  } else {
                    let json;
                    try {
                      json = JSON.parse(response.text);
                    } catch (error) {
                      throw new Error('接口返回的不是有效 JSON');
                    }
                    const succeeded = json && (json.isok === true || json.code === 0);
                    const message = json && (json.msg || json.message || json.Message);
                    setOperationResult(succeeded
                      ? `销假成功${message ? `：${message}` : ''}`
                      : `销假失败：${message || '服务器未返回失败原因'}`);
                  }
                } catch (e) {
                  setOperationResult(`销假异常：${e.message}`);
                } finally {
                  btn.disabled = false;
                  btn.textContent = '销假';
                }
              }
            })
          } catch (e) {
            result.innerHTML = `<div>请求或解析失败：${e.message}</div>`
          }
        }
        container.querySelector('#loadLeaveList').onclick = load;
        load();
      }
    },
    //学生活动相关功能
    {
      id: 'activity-list',
      name: '(学工系统)学生活动',
      description: '获取活动列表，查看详情、报名状态和活动提醒。',
      render(container, context) {
        container.innerHTML = `<div class="tool-head"><button class="secondary tool-back">返回工具箱</button><h4>学生活动</h4></div><div class="actions"><button id="refreshActivity">刷新活动</button></div><div id="activityResult">等待查询</div>`;
        container.querySelector('.tool-back').onclick = context.back;
        const style = document.createElement('style');
        style.textContent = `
          .act-list{display:flex;flex-direction:column;gap:8px;font-size:12px}
          .act-card{border:1px solid #cbd5e1;border-radius:9px;padding:10px;background:#f8fafc}
          .act-title{font-size:14px;font-weight:600;color:#0f172a}
          .act-info{margin-top:5px;color:#475569;line-height:1.6;word-break:break-word}
          .act-id{color:#64748b}
          .act-btn{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:5px;margin-top:8px}
          .act-btn button{font-size:11px;padding:4px 9px;margin:0}
          .operation-result{min-height:18px;margin-top:7px;color:#334155;white-space:pre-wrap;word-break:break-word}
        `;
        container.appendChild(style);
        const result = container.querySelector('#activityResult');
        async function getActivityList() {
          const response = await context.request({
            method: 'POST',
            url: 'https://plat.hxxy.edu.cn/studentwork/lessonactivity/getlessonstudentactivitycenterlist',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
              AcademicYear: '0',
              Semester: '0',
              ProjectCategoryType: '0',
              ProjectType: '0',
              ActivityType: '0',
              ActivityLevel: '0',
              Sponsor: '',
              Organizer: '',
              ActivityStatue: '0',
              key: '',
              _search: 'false',
              nd: '',
              rows: '30',
              page: '1',
              sidx: '',
              sord: 'asc'
            }).toString()
          });
          return JSON.parse(response.text).data || [];
        }
        function setActivityResult(activity, message) {
          const resultBox = container.querySelector(`#act-result-${activity.id}`);
          if (resultBox) resultBox.textContent = message;
        }
        function renderActivityQrFallback(activity) {
          let refreshTimer = null;
          let requestSerial = 0;
          let stopped = false;
          container.innerHTML = '<div class="tool-head"><button class="secondary qr-back">返回</button><h4>活动二维码</h4></div><div class="qr-api-result">正在获取二维码...</div>';
          const backToActivity = () => {
            stopped = true;
            if (refreshTimer) window.clearInterval(refreshTimer);
            context.reload();
          };
          container.querySelector('.qr-back').onclick = backToActivity;
          const qrResult = container.querySelector('.qr-api-result');
          qrResult.style.cssText = 'min-height:260px;display:flex;align-items:center;justify-content:center;overflow:auto;background:#fff;border:1px solid #cbd5e1;border-radius:6px;padding:12px';
          const loadQrCode = () => {
            const serial = ++requestSerial;
            if (serial > 1) qrResult.textContent = '正在刷新二维码...';
            context.request({
              method: 'GET',
              url: 'https://me.hxxy.edu.cn/studentwork/LessonActivity/GetQrCodeStr?ActivityId=' + encodeURIComponent(activity.id)
            }).then(response => {
              if (stopped || serial !== requestSerial) return;
              if (response.error) throw new Error(response.error);
              const payload = JSON.parse(response.text);
              if (payload.code !== 0 || !payload.data || !payload.data.item1) throw new Error(payload.msg || '二维码接口未返回有效内容');
              const parsed = new DOMParser().parseFromString(String(payload.data.item1), 'text/html');
              parsed.querySelectorAll('script, iframe, object, embed, link, style').forEach(node => node.remove());
              parsed.querySelectorAll('*').forEach(node => {
                Array.from(node.attributes).forEach(attribute => {
                  if (/^on/i.test(attribute.name) || (/^(src|href)$/i.test(attribute.name) && /^\s*javascript:/i.test(attribute.value))) node.removeAttribute(attribute.name);
                });
              });
              qrResult.innerHTML = '';
              Array.from(parsed.body.childNodes).forEach(node => qrResult.appendChild(document.importNode(node, true)));
              qrResult.querySelectorAll('img, canvas, svg').forEach(node => {
                node.style.setProperty('display', 'block', 'important');
                node.style.setProperty('max-width', '100%', 'important');
                node.style.setProperty('max-height', 'min(56vh, 480px)', 'important');
                node.style.setProperty('width', 'auto', 'important');
                node.style.setProperty('height', 'auto', 'important');
                node.style.setProperty('margin', '0 auto', 'important');
                node.removeAttribute('width');
                node.removeAttribute('height');
              });
            }).catch(error => {
              if (!stopped && serial === requestSerial) qrResult.textContent = '二维码获取失败：' + error.message;
            });
          };
          loadQrCode();
          refreshTimer = window.setInterval(loadQrCode, 5000);
        }
        function openActivityQrCode(activity) {
          context.openInternalPage(
            '活动二维码',
            'https://me.hxxy.edu.cn/studentwork/LessonActivity/QrcodeTrendsIndex?id=' + encodeURIComponent(activity.id),
            () => renderActivityQrFallback(activity)
          );
        }
        async function applyActivity(activity) {
          setActivityResult(activity, '正在报名...');
          try {
            const response = await context.request({
              method: 'POST',
              url: 'https://plat.hxxy.edu.cn/studentwork/LessonActivityMobile/AddApplyFor',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
              },
              body: new URLSearchParams({
                Phone: "18888888888",
                ReasonsApplying: "申请报名",
                ActivityId: activity.id,
              }).toString()
            });
            const json = JSON.parse(response.text);
            if (json.code === 0) {
              setActivityResult(activity, `报名成功：${activity.activityname}`);
            } else {
              setActivityResult(activity, `报名失败：${json.msg || '未知错误'}`);
            }
          } catch (e) {
            setActivityResult(activity, `报名异常：${e.message}`);
          }
        }
        async function cancelActivity(activity) {
          const resultBox = container.querySelector(`#act-result-${activity.id}`);
          if (resultBox) {
            resultBox.textContent = '正在取消报名...';
          }
          try {
            const response = await context.request({
              method: 'GET',
              url: 'https://plat.hxxy.edu.cn/studentwork/LessonActivityMobile/CancelRegistration?activityId=' + activity.id
            });
            const json = JSON.parse(response.text);
            if (json.isok) {
              if (resultBox) {
                resultBox.textContent = '取消报名成功';
              }
            } else {
              if (resultBox) {
                resultBox.textContent = '取消失败：' + (json.msg || '未知错误');
              }
            }
          } catch (e) {
            if (resultBox) {
              resultBox.textContent = '请求异常：' + e.message;
            }
          }
        }
        async function signInActivity(activity) {
          setActivityResult(activity, '正在签到...');
          try {
            const response = await context.request({
              method: 'POST',
              url: 'https://plat.hxxy.edu.cn/studentwork/LessonActivityMobile/SubmitStuActSignUpSanCodeSignin',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
              },
              body: new URLSearchParams({
                ActivityId: activity.id,
              }).toString()
            });
            const json = JSON.parse(response.text);
            if (json.code === 0) {
              setActivityResult(activity, `签到成功：${activity.activityname}`);
            } else {
              setActivityResult(activity, `签到失败：${json.msg || '未知错误'}`);
            }
          } catch (e) {
            setActivityResult(activity, `签到异常：${e.message}`);
          }
        }
        async function signOutActivity(activity) {
          setActivityResult(activity, '正在签退...');
          try {
            const response = await context.request({
              method: 'POST',
              url: 'https://plat.hxxy.edu.cn/studentwork/LessonActivityMobile/SubmitStuActSignUpScanCodeSignOut',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
              },
              body: new URLSearchParams({
                ActivityId: activity.id,
              }).toString()
            });
            const json = JSON.parse(response.text);
            if (json.code === 0) {
              setActivityResult(activity, `签退成功：${activity.activityname}`);
            } else {
              setActivityResult(activity, `签退失败：${json.msg || '未知错误'}`);
            }
          } catch (e) {
            setActivityResult(activity, `签退异常：${e.message}`);
          }
        }
        // 抢报：按次数/间隔循环发送报名包（间隔 0 为全速并发）
        function renderGrabPage(activity) {
          const grab = {
            running: false,
            sent: 0,
            success: 0,
            fail: 0,
            logs: []
          };
          container.innerHTML = `
            <div class="tool-head"><button class="secondary grab-back">返回</button><h4>活动抢报</h4></div>
            <div class="grab-title">${esc(activity.activityname || '')}</div>
            <div class="grab-info">活动ID：${esc(activity.id)}</div>
            <div class="grab-config">
              <label>循环执行次数（-1 为无限）<input id="grabTimes" type="number" value="-1"></label>
              <label>循环间隔（毫秒，0 为全速并发发送报名请求）<input id="grabInterval" type="number" value="1000" min="0"></label>
            </div>
            <div class="actions">
              <button id="grabStart">开始抢报</button>
              <button id="grabStop" class="danger" disabled>停止</button>
            </div>
            <div id="grabStatus" class="grab-status"></div>
            <pre id="grabLog" class="grab-log">等待开始</pre>
          `;
          container.querySelector('.grab-back').onclick = () => {
            grab.running = false;
            context.reload();
          };
          const statusEl = container.querySelector('#grabStatus');
          const logEl = container.querySelector('#grabLog');
          const startBtn = container.querySelector('#grabStart');
          const stopBtn = container.querySelector('#grabStop');
          const style = document.createElement('style');
          style.textContent = `
            .grab-title{font-size:14px;font-weight:600;color:#0f172a;margin-top:8px}
            .grab-info{font-size:12px;color:#64748b;margin-top:4px}
            .grab-config{border:1px solid #cbd5e1;border-radius:9px;padding:10px;background:#f8fafc;margin-top:8px}
            .grab-status{margin-top:8px;font-size:12px;color:#334155;white-space:pre-wrap}
            .grab-log{margin-top:8px;max-height:220px;overflow:auto;font-size:11px}
          `;
          container.appendChild(style);
          const update = () => {
            statusEl.textContent = (grab.running ? '状态：抢报中' : (grab.sent > 0 ? '状态：已停止' : '状态：未开始'))
              + `\n已发送：${grab.sent}  成功：${grab.success}  失败：${grab.fail}`;
            logEl.textContent = grab.logs.slice(-40).join('\n') || '等待开始';
            logEl.scrollTop = logEl.scrollHeight;
            startBtn.disabled = grab.running;
            stopBtn.disabled = !grab.running;
          };
          const grabLog = text => {
            grab.logs.push(`${new Date().toLocaleTimeString()} ${text}`);
            update();
          };
          const sendApply = async () => {
            const response = await context.request({
              method: 'POST',
              url: 'https://plat.hxxy.edu.cn/studentwork/LessonActivityMobile/AddApplyFor',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                Phone: '18888888888',
                ReasonsApplying: '申请报名',
                ActivityId: activity.id
              }).toString()
            });
            let json;
            try {
              json = JSON.parse(response.text);
            } catch (e) {
              throw new Error(response.error || `HTTP ${response.status}`);
            }
            return json;
          };
          const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
          async function run() {
            const times = Number(container.querySelector('#grabTimes').value) || -1;
            const interval = Math.max(0, Number(container.querySelector('#grabInterval').value) || 0);
            grab.running = true;
            grab.sent = 0;
            grab.success = 0;
            grab.fail = 0;
            grab.logs = [];
            update();
            grabLog(`开始抢报：${activity.activityname || ''}（次数=${times}，间隔=${interval}ms）`);
            try {
              while (grab.running) {
                if (times !== -1 && grab.sent >= times) break;
                if (interval === 0) {
                  const remaining = times === -1 ? AUTO_BATCH_SIZE : Math.min(AUTO_BATCH_SIZE, times - grab.sent);
                  const batch = [];
                  for (let i = 0; i < remaining && grab.running; i++) {
                    batch.push(sendApply().then(json => {
                      grab.sent++;
                      if (json.code === 0) {
                        grab.success++;
                        grabLog(`#${grab.sent} 报名成功`);
                      } else {
                        grab.fail++;
                        grabLog(`#${grab.sent} 报名失败：${json.msg || '未知错误'}`);
                      }
                    }).catch(e => {
                      grab.sent++;
                      grab.fail++;
                      grabLog(`#${grab.sent} 请求异常：${e.message}`);
                    }));
                  }
                  await Promise.all(batch);
                  // 批次间留出微退避：避免无限+全速时事件循环被占满导致停止按钮无法响应
                  if (grab.running) await sleep(5);
                } else {
                  await sendApply().then(json => {
                    grab.sent++;
                    if (json.code === 0) {
                      grab.success++;
                      grabLog(`#${grab.sent} 报名成功`);
                    } else {
                      grab.fail++;
                      grabLog(`#${grab.sent} 报名失败：${json.msg || '未知错误'}`);
                    }
                  }).catch(e => {
                    grab.sent++;
                    grab.fail++;
                    grabLog(`#${grab.sent} 请求异常：${e.message}`);
                  });
                  if (grab.running && (times === -1 || grab.sent < times)) await sleep(interval);
                }
              }
            } finally {
              grab.running = false;
              grabLog(`抢报结束：共发送 ${grab.sent} 次，成功 ${grab.success}，失败 ${grab.fail}`);
              update();
            }
          }
          startBtn.onclick = run;
          stopBtn.onclick = () => {
            grab.running = false;
            grabLog('正在停止...（在途请求完成后停止）');
          };
          update();
        }
        function getActivityStatus(activity) {
          return {
            status: activity.activitystartstate,
            signin: activity.issignin,
            signout: activity.issignout
          };
        }
        function remindActivity(activity) {
          const start = new Date(activity.begindate);
          const end = new Date(activity.enddate);
          const now = new Date();
          const diffStart = start - now;
          const diffEnd = end - now;
          if (diffStart > 0 && diffStart < 30 * 60 * 1000) {
            console.log('活动即将开始:', activity.activityname);
          }
          if (diffEnd > 0 && diffEnd < 30 * 60 * 1000) {
            console.log('活动即将结束:', activity.activityname);
          }
        }
        async function load() {
          result.textContent = '正在加载...';
          try {
            const data = await getActivityList();
            if (!data.length) {
              result.textContent = '暂无活动';
              return;
            }
            let html = '<div class="act-list">';
            data.slice(0, 30).forEach((item, index) => {
              const status = getActivityStatus(item);
              html += `
                    <div class="act-card">
                    <div class="act-title">
                    ${item.activityname || ''}
                    </div>
                    <div class="act-info">
                    <div>ID:
                    <span class="act-id">${item.id}</span>
                    </div>
                    <div>
                    时间:
                    ${item.begindate || ''}
                    ~
                    ${item.enddate || ''}
                    </div>
                    <div>
                    地点:
                    ${item.schoolviewstr || ''}
                    </div>
                    <div>
                    类型:
                    ${item.projecttypename || ''}
                    </div>
                    <div>
                    负责人:
                    ${item.activityresponsiblepersonname || ''}
                    </div>
                    <div>
                    指导老师:
                    ${item.guidanceteachername || ''}
                    </div>
                    <div>
                    报名:
                    ${item.registrationdatestr || ''}
                    </div>
                    <div>
                    状态:
                    ${status.status || ''}
                    </div>
                    </div>
                    <div class="act-btn">
                    <button class="qr-btn">二维码</button>
                    <button class="apply-btn">
                    报名
                    </button>
                    <button class="grab-btn">
                    抢报
                    </button>
                    <button class="cancel-btn">取消报名</button>
                    <button class="signin-btn">
                    签到
                    </button>
                    <button class="signout-btn">
                    签退
                    </button>
                    </div>
                    <div class="act-result operation-result" id="act-result-${item.id}"></div>
                    </div>
                    `;
            });
            html += '</div>';
            result.innerHTML = html;
            container.querySelectorAll('.qr-btn').forEach((b, i) => {
              b.onclick = () => openActivityQrCode(data[i]);
            });
            container.querySelectorAll('.apply-btn').forEach((b, i) => {
              b.onclick = () => applyActivity(data[i]);
            });
            container.querySelectorAll('.grab-btn').forEach((b, i) => {
              b.onclick = () => renderGrabPage(data[i]);
            });
            container.querySelectorAll('.cancel-btn').forEach((b, i) => {
              b.onclick = () => cancelActivity(data[i]);
            });
            container.querySelectorAll('.signin-btn').forEach((b, i) => {
              b.onclick = () => signInActivity(data[i]);
            });
            container.querySelectorAll('.signout-btn').forEach((b, i) => {
              b.onclick = () => signOutActivity(data[i]);
            });
            data.forEach(remindActivity);
          } catch (e) {
            result.textContent = '加载失败:' + e.message;
          }
        }
        container.querySelector('#refreshActivity').onclick = load;
        load();
      }
    },
    // 假期登记：活动列表、详情页 ID 解析，以及离校/到达/返校确认。
    {
      id: 'holiday-registration',
      name: '(学工系统)假期登记',
      description: '查询假期登记活动，直接执行离校、到达和返校确认。',
      render(container, context) {
        container.innerHTML = `<div class="tool-head"><button class="secondary tool-back">返回工具箱</button><h4>假期登记</h4></div><div class="actions"><button id="refreshHolidayList">刷新活动</button></div><div id="holidayResult">等待查询</div>`;
        container.querySelector('.tool-back').onclick = context.back;
        const style = document.createElement('style');
        style.textContent = `
          .holiday-list{display:flex;flex-direction:column;gap:8px;font-size:12px}
          .holiday-card{border:1px solid #cbd5e1;border-radius:9px;padding:10px;background:#f8fafc}
          .holiday-title{font-size:14px;font-weight:600;color:#0f172a}
          .holiday-meta{margin-top:5px;color:#475569;line-height:1.6;word-break:break-word}
          .holiday-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:5px;margin-top:8px}
          .holiday-actions button{font-size:11px;padding:4px 9px}
          .holiday-result{min-height:18px;margin-top:7px;color:#334155;white-space:pre-wrap;word-break:break-word}
        `;
        container.appendChild(style);
        const result = container.querySelector('#holidayResult');
        const formHeaders = {'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'};
        const apiBase = 'https://me.hxxy.edu.cn/studentwork';
        function parseApiResponse(response) {
          if (response.error) throw new Error(response.error);
          if (!response.ok) throw new Error(`HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`);
          try {
            return JSON.parse(response.text);
          } catch (error) {
            throw new Error('接口返回的不是有效 JSON');
          }
        }
        function apiMessage(json) {
          if (!json || typeof json !== 'object') return '未知返回';
          return String(json.msg || json.message || json.Message || (json.isok ? '操作成功' : '操作失败'));
        }
        function apiSucceeded(json) {
          return Boolean(json && (json.isok === true || json.code === 0));
        }
        function getCurrentLocation() {
          return Promise.resolve({
            address: '厦门华夏',
            longitudeGaoDe: '118.077544',
            latitudeGaoDe: '24.633716',
            note: ''
          });
        }
        async function getDetailIds(activityId) {
          const response = await context.request({
            method: 'GET',
            url: `${apiBase}/vHStudent/VLeave?id=${encodeURIComponent(activityId)}`
          });
          if (response.error) throw new Error(response.error);
          if (!response.ok) throw new Error(`详情页 HTTP ${response.status}`);
          const ids = [];
          const seen = new Set();
          const pattern = /btn(?:LeaveSchoolRevoke|Arrive|LeaveSchool)\(\s*['"]?(\d+)['"]?\s*\)/g;
          let match;
          while ((match = pattern.exec(response.text)) !== null) {
            if (!seen.has(match[1])) {
              seen.add(match[1]);
              ids.push(match[1]);
            }
          }
          if (!ids.length) throw new Error('详情页中未找到离校/到达登记 ID，可能尚未填写假期去向');
          return ids;
        }
        async function postForm(path, data) {
          const response = await context.request({
            method: 'POST',
            url: apiBase + path,
            headers: formHeaders,
            body: new URLSearchParams(data).toString()
          });
          return parseApiResponse(response);
        }
        async function runDetailAction(activity, action) {
          const ids = await getDetailIds(activity.id);
          const location = action === 'arrive' ? await getCurrentLocation() : null;
          const lines = [];
          for (const id of ids) {
            const json = action === 'leave'
              ? await postForm('/HStudent/Save_Leave', {id})
              : await postForm('/HStudent/Save_Arrive', {
                  id,
                  address: '',
                  longitudeGaoDe: location.longitudeGaoDe,
                  latitudeGaoDe: location.latitudeGaoDe,
                  arriveCode: '0'
                });
            lines.push(`${id}：${apiSucceeded(json) ? '成功' : '失败'} - ${apiMessage(json)}`);
          }
          if (location && location.note) lines.push(location.note);
          return lines.join('\n');
        }
        async function runBackAction(activity) {
          const location = await getCurrentLocation();
          const json = await postForm('/vHStudent/SubmitSignin', {
            id: activity.id,
            address: location.address,
            longitudeGaoDe: location.longitudeGaoDe,
            latitudeGaoDe: location.latitudeGaoDe
          });
          return `${apiSucceeded(json) ? '成功' : '失败'} - ${apiMessage(json)}${location.note ? `\n${location.note}` : ''}`;
        }
        function appendMeta(parent, label, value) {
          if (value == null || value === '') return;
          const line = document.createElement('div');
          line.textContent = `${label}：${value}`;
          parent.appendChild(line);
        }
        function createActionButton(label, activity, resultBox, runner) {
          const button = document.createElement('button');
          button.textContent = label;
          button.onclick = async () => {
            const originalText = button.textContent;
            button.disabled = true;
            button.textContent = '执行中...';
            resultBox.textContent = `正在执行${label}...`;
            try {
              resultBox.textContent = `${label}结果：\n${await runner(activity)}`;
            } catch (error) {
              resultBox.textContent = `${label}异常：${error.message}`;
            } finally {
              button.disabled = false;
              button.textContent = originalText;
            }
          };
          return button;
        }
        function renderActivities(activities) {
          result.innerHTML = '';
          if (!activities.length) {
            result.textContent = '暂无需要登记的假期活动';
            return;
          }
          const list = document.createElement('div');
          list.className = 'holiday-list';
          activities.forEach(activity => {
            const card = document.createElement('div');
            card.className = 'holiday-card';
            const title = document.createElement('div');
            title.className = 'holiday-title';
            title.textContent = activity.name || `假期活动 ${activity.id || ''}`;
            const meta = document.createElement('div');
            meta.className = 'holiday-meta';
            appendMeta(meta, '活动 ID', activity.id);
            appendMeta(meta, '假期时间', activity.starttime && activity.endtime ? `${activity.starttime} ~ ${activity.endtime}` : activity.starttime || activity.endtime);
            appendMeta(meta, '返校时间', activity.returnstarttime && activity.returnendtime ? `${activity.returnstarttime} ~ ${activity.returnendtime}` : activity.returnstarttime || activity.returnendtime);
            const actions = document.createElement('div');
            actions.className = 'holiday-actions';
            const operationResult = document.createElement('div');
            operationResult.className = 'holiday-result';
            actions.appendChild(createActionButton('离校', activity, operationResult, item => runDetailAction(item, 'leave')));
            actions.appendChild(createActionButton('到达', activity, operationResult, item => runDetailAction(item, 'arrive')));
            actions.appendChild(createActionButton('返校', activity, operationResult, runBackAction));
            card.appendChild(title);
            card.appendChild(meta);
            card.appendChild(actions);
            card.appendChild(operationResult);
            list.appendChild(card);
          });
          result.appendChild(list);
        }
        async function load() {
          result.textContent = '正在查询假期登记活动...';
          try {
            const response = await context.request({
              method: 'POST',
              url: `${apiBase}/HStudent/_HolidayActiveList`,
              headers: formHeaders,
              body: new URLSearchParams({key: '', page: '1', rows: '100', schoolyear: '-1'}).toString()
            });
            const json = parseApiResponse(response);
            renderActivities(Array.isArray(json.data) ? json.data : []);
          } catch (error) {
            result.textContent = `加载失败：${error.message}`;
          }
        }
        container.querySelector('#refreshHolidayList').onclick = load;
        load();
      }
    },
    //晚寝签到功能
    {
      id: 'punchm-list',
      name: '(学工系统)晚寝签到',
      description: '查看晚寝考勤活动列表。',
      render(container, context) {
        container.innerHTML = `
                    <div class="tool-head">
                        <button class="secondary tool-back">返回工具箱</button>
                        <h4>晚寝考勤</h4>
                    </div>
                    <div class="actions">
                        <button id="refreshPunchM">刷新列表</button>
                    </div>
                    <div id="punchMResult">等待查询</div>
                `;
        container.querySelector('.tool-back').onclick = context.back;
        const style = document.createElement('style');
        style.textContent = `
          .punch-list{display:flex;flex-direction:column;gap:8px;font-size:12px}
          .punch-card{border:1px solid #cbd5e1;border-radius:9px;padding:10px;background:#f8fafc}
          .punch-title{font-size:14px;font-weight:600;color:#0f172a}
          .punch-info{margin-top:5px;color:#475569;line-height:1.6;word-break:break-word}
          .punch-btn{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:5px;margin-top:8px}
          .punch-btn button{font-size:11px;padding:4px 9px;margin:0}
          .punch-result{min-height:18px;margin-top:7px;color:#334155;white-space:pre-wrap;word-break:break-word}
        `;
        container.appendChild(style);
        const result = container.querySelector('#punchMResult');
        async function getPunchList() {
          const urls = [
            'https://plat.hxxy.edu.cn/studentwork/PunchMStudent/GetActivityList',
            'https://plat.hxxy.edu.cn/studentwork/PunchMTeacher/_TableList'
          ];
          for (const url of urls) {
            try {
              const response = await context.request({
                method: 'POST',
                url: url,
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                  page: '1',
                  size: '1000'
                }).toString()
              });
              const json = JSON.parse(response.text);
              if (json.isok !== false) {
                return json.data || [];
              }
            } catch (e) {
            }
          }
          throw new Error('晚寝活动列表获取失败');
        }
        function setPunchResult(activity, message) {
          const resultBox = container.querySelector(`#punch-result-${activity.id}`);
          if (resultBox) resultBox.textContent = message;
        }
        function openPunchQrCode(activity) {
          context.openInternalPage('晚寝二维码', 'https://plat.hxxy.edu.cn/studentwork/PunchMStudent/QrcodeTrends?id=' + encodeURIComponent(activity.id));
        }
        async function punchSign(activity) {
          setPunchResult(activity, '正在签到...');
          try {
            const response = await context.request({
              method: 'POST',
              url: 'https://plat.hxxy.edu.cn/studentwork/PunchMStudent/SubmitSignin',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
              },
              body: new URLSearchParams({
                ActivityId: activity.id,
              }).toString()
            });
            const json = JSON.parse(response.text);
            if (json.code === 0) {
              setPunchResult(activity, `签到成功：${activity.activityname || activity.name || ''}`);
            } else {
              setPunchResult(activity, `签到失败：${json.msg || '未知错误'}`);
            }
          } catch (e) {
            setPunchResult(activity, `签到异常：${e.message}`);
          }
        }
        function getPunchStatus(activity) {
          return activity.status || '未知';
        }
        function remindPunch(activity) {
          // TODO 晚寝时间提醒
        }
        async function load() {
          result.textContent = '正在加载...';
          try {
            const data = await getPunchList();
            if (!data.length) {
              result.textContent = '暂无晚寝考勤活动';
              return;
            }
            let html = '<div class="punch-list">';
            data.forEach((item, index) => {
              html += `
    <div class="punch-card">
        <div class="punch-title">
            ${item.name ?? ''}
        </div>
        <div class="punch-info">
            <div>
                ID：
                ${item.id ?? ''}
            </div>
            <div>
                类型：
                ${item.sigintypeview ?? ''}
            </div>
            <div>
                时间：
                ${item.sigindaytimestr ?? ''}
            </div>
            <div>
                周期：
                ${item.foreachp_cyclestr ?? ''}
            </div>
            <div>
                有效期：
                ${item.foreachp_startday ?? ''}
                ~
                ${item.foreachp_endday ?? ''}
            </div>
            <div>
                状态：
                ${item.foreachp_daysttstr ?? ''}
            </div>
            <div>
                级别：
                ${item.activitylevelview ?? ''}
            </div>
        </div>
        <div class="punch-btn">
            <button class="punch-detail">
                二维码
            </button>
            <button class="punch-sign">
                签到
            </button>
        </div>
        <div class="punch-result operation-result" id="punch-result-${item.id}"></div>
    </div>
    `;
            });
            html += '</div>';
            result.innerHTML = html;
            container.querySelectorAll('.punch-detail')
              .forEach((btn, i) => {
                btn.onclick = () => openPunchQrCode(data[i]);
              });
            container.querySelectorAll('.punch-sign')
              .forEach((btn, i) => {
                btn.onclick = () => punchSign(data[i]);
              });
            data.forEach(remindPunch);
          } catch (e) {
            result.textContent = '加载失败：' + e.message;
          }
        }
        container.querySelector('#refreshPunchM').onclick = load;
        load();
      }
    },
	//WebVPN改名
	{
    id: 'webvpn-change-name',
    name: 'WebVPN改名',
    description: '修改WebVPN账号姓名和昵称，请在WebVPN界面使用。',
    render(container, context) {
        container.innerHTML = `
            <div class="tool-head">
                <button class="secondary tool-back">返回工具箱</button>
                <h4>修改WebVPN用户名</h4>
            </div>
            <label>
                姓名
                <input id="webvpnFullName" placeholder="请输入姓名">
            </label>
            <label>
                昵称
                <input id="webvpnNickname" placeholder="请输入昵称">
            </label>
            <div class="actions">
                <button id="submitWebvpnChangeName">修改用户名</button>
            </div>
            <pre id="webvpnChangeResult">等待提交</pre>
        `;
        container.querySelector('.tool-back').onclick = context.back;
        container.querySelector('#submitWebvpnChangeName').onclick = async () => {
            const fullName = container.querySelector('#webvpnFullName').value.trim();
            const nickname = container.querySelector('#webvpnNickname').value.trim();
            const result = container.querySelector('#webvpnChangeResult');
            if (!fullName || !nickname) {
                result.textContent = '请填写姓名和昵称';
                return;
            }
            result.textContent = '正在提交...';
            const response = await context.request({
                method: 'POST',
                url: 'https://webvpn.hxxy.edu.cn/api/access/user/change-info',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    fullName,
                    nickname
                })
            });
            context.showResult(result, response);
        };
    }
},
//微华厦抢宿舍
{
    id: 'ssyx',
    name: '(微华厦)宿舍预选',
    description: '请在微华厦打开。自动进行宿舍预选，请填写目标价位后开始。',
    render(container, context) {
        container.innerHTML = `
            <div class="tool-head">
                <button class="secondary tool-back">返回工具箱</button>
                <h4>宿舍预选</h4>
            </div>
            <label>
                选择价位
                <select id="ssyxSelectPrice">
                    <option value="3000">3000</option>
                    <option value="4000">4000</option>
                    <option value="1500">1500</option>
                </select>
            </label>
            <label>
                自定义价位（优先）
                <input id="ssyxCustomPrice" placeholder="例如1500">
            </label>
            <label>
                请求间隔(ms)（0为不限制）
                <input 
                    id="ssyxInterval"
                    type="number"
                    min="0"
                    value="100">
            </label>
            <label>
                <input type="checkbox" id="ssyxScheduleEnable">
                定时开始
            </label>
            <label>
                开始日期
                <input type="date" id="ssyxDate">
            </label>
            <label>
                开始时间
                <input type="time" id="ssyxTime">
            </label>
            <div class="actions">
                <button id="startSsyx">
                    开始抢宿舍
                </button>
            </div>
            <pre id="ssyxResult">
等待开始
            </pre>
        `;
        container.querySelector('.tool-back')
            .onclick = context.back;
        const selectPrice =
            container.querySelector('#ssyxSelectPrice');
        const customPrice =
            container.querySelector('#ssyxCustomPrice');
        const intervalInput =
            container.querySelector('#ssyxInterval');
        const scheduleEnable =
            container.querySelector('#ssyxScheduleEnable');
        const dateInput =
            container.querySelector('#ssyxDate');
        const timeInput =
            container.querySelector('#ssyxTime');
        const button =
            container.querySelector('#startSsyx');
        const result =
            container.querySelector('#ssyxResult');
        // 默认今天
        const now = new Date();
        dateInput.value =
            now.toISOString()
                .substring(0,10);
        // 默认当前时间
        timeInput.value =
            now.toTimeString()
                .substring(0,5);
        let running = false;
        let count = 0;
        function nowTime() {
            return new Date()
                .toLocaleTimeString();
        }
        function appendResult(text) {
            result.textContent +=
                `\n[${nowTime()}]\n${text}\n`;
            result.scrollTop =
                result.scrollHeight;
        }
        async function requestSsyx() {
            if (!running) {
                return;
            }
            const price =
                customPrice.value.trim() ||
                selectPrice.value;
            count++;
            appendResult(
                `第 ${count} 次请求\n目标价位: ${price}`
            );
            try {
                const response =
                    await context.request({
                        method:'POST',
                        url:
                        'https://m.hxxy.edu.cn/xitong/ssyx/select.php',
                        headers:{
                            'Content-Type':
                            'application/x-www-form-urlencoded'
                        },
                        body:
                        new URLSearchParams({
                            price
                        }).toString()
                    });
                let data;
                try {
                    data =
                        JSON.parse(response.text);
                } catch(e) {
                    data=response;
                }
                if(data && data.msg !== undefined){
                    appendResult(
                        data.msg
                    );
                }else{
                    appendResult(
                        JSON.stringify(data)
                    );
                }
            }catch(e){
                appendResult(
                    `请求异常:\n${e}`
                );
            }
        }
        async function loopSsyx(){
            while(running){
                await requestSsyx();
                if(!running){
                    break;
                }
                let interval =
                    parseInt(intervalInput.value);
                if(
                    isNaN(interval) ||
                    interval < 0
                ){
                    interval=0;
                }
                if(interval > 0){
                    await new Promise(resolve=>{
                        setTimeout(
                            resolve,
                            interval
                        );
                    });
                }
            }
        }
        function startRunning(){
            running=true;
            count=0;
            button.textContent=
                '停止抢宿舍';
            appendResult(
                '开始执行抢宿舍'
            );
            loopSsyx();
        }
        function waitSchedule(targetTime){
            const timer =
                setInterval(()=>{
                    const now =
                        Date.now();
                    const remain =
                        targetTime-now;
                    if(remain<=0){
                        clearInterval(timer);
                        appendResult(
                            '定时时间到，开始执行'
                        );
                        startRunning();
                        return;
                    }
                    const sec =
                        Math.floor(
                            remain/1000
                        );
                    button.textContent =
                        `等待开始 (${sec}s)`;
                },1000);
        }
        button.onclick=()=>{
            if(running){
                running=false;
                button.textContent=
                    '开始抢宿舍';
                appendResult(
                    '已停止'
                );
                return;
            }
            if(scheduleEnable.checked){
                const target =
                    new Date(
                        `${dateInput.value}T${timeInput.value}`
                    ).getTime();
                if(isNaN(target)){
                    appendResult(
                        '定时时间无效'
                    );
                    return;
                }
                if(target <= Date.now()){
                    appendResult(
                        '定时时间必须晚于当前时间'
                    );
                    return;
                }
                appendResult(
                    `等待定时开始:\n${dateInput.value} ${timeInput.value}`
                );
                waitSchedule(target);
            }else{
                startRunning();
            }
        };
    }
},
    //(迎新)家庭信息
    {
      id: 'welcome-family-index',
      name: '(迎新)家庭信息',
      description: '通过迎新接口设置家庭信息：地区编码、地址、监护人电话、收入、家庭类型。',
      render(container, context) {
        container.innerHTML = `
            <div class="tool-head">
                <button class="secondary tool-back">返回工具箱</button>
                <h4>设置家庭信息</h4>
            </div>
            <label>
                地区编码
                <input id="familyAreaCode" placeholder="如 350213">
            </label>
            <label>
                地址
                <input id="familyAddress" placeholder="请输入家庭地址">
            </label>
            <label>
                监护人电话
                <input id="familyPhone" placeholder="请输入监护人电话">
            </label>
            <label>
                家庭收入
                <input id="familyIncome" type="number" step="0.01" placeholder="如 50000">
            </label>
            <label>
                家庭类型
                <input id="familyType" type="number" min="1" placeholder="如 1（双亲健全）">
            </label>
            <div class="actions">
                <button id="submitFamilyInfo">保存家庭信息</button>
            </div>
            <pre id="familyInfoResult">等待提交</pre>
        `;
        container.querySelector('.tool-back').onclick = context.back;
        container.querySelector('#submitFamilyInfo').onclick = async () => {
          const areaCode = container.querySelector('#familyAreaCode').value.trim();
          const address = container.querySelector('#familyAddress').value.trim();
          const phone = container.querySelector('#familyPhone').value.trim();
          const income = container.querySelector('#familyIncome').value.trim();
          const type = container.querySelector('#familyType').value.trim();
          const result = container.querySelector('#familyInfoResult');
          if (!areaCode || !address || !phone || !income || !type) {
            result.textContent = '请填写全部字段';
            return;
          }
          result.textContent = '正在提交...';
          try {
            const response = await context.request({
              method: 'POST',
              url: 'https://plat.hxxy.edu.cn/welcome/WelcomeAppMStudent/FamilyIndex',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
              },
              body: new URLSearchParams({
                HomeAddressAreaCodeView: areaCode,
                HomeAddress: address,
                HomePhone: phone,
                HomeIncome: income,
                HomeTypeView: type
              }).toString()
            });
            if (response.error) {
              result.textContent = `请求失败：${response.error}`;
              return;
            }
            let json;
            try {
              json = JSON.parse(response.text);
            } catch (e) {
              context.showResult(result, response);
              return;
            }
            const message = json && (json.msg || json.message);
            result.textContent = json && json.isok === true
              ? `保存成功${message ? `：${message}` : ''}`
              : `保存失败${message ? `：${message}` : `：HTTP ${response.status}`}`;
          } catch (e) {
            result.textContent = `提交异常：${e.message}`;
          }
        };
      }
    },
    //(迎新)联系信息
    {
      id: 'welcome-contact-info',
      name: '(迎新)联系信息',
      description: '通过迎新接口设置联系信息：手机号、邮箱、QQ、微信号。',
      render(container, context) {
        container.innerHTML = `
            <div class="tool-head">
                <button class="secondary tool-back">返回工具箱</button>
                <h4>设置联系信息</h4>
            </div>
            <label>
                手机号
                <input id="contactPhone" placeholder="请输入手机号">
            </label>
            <label>
                邮箱
                <input id="contactEmail" placeholder="请输入邮箱">
            </label>
            <label>
                QQ
                <input id="contactQQ" placeholder="请输入QQ号">
            </label>
            <label>
                微信号
                <input id="contactWX" placeholder="请输入微信号">
            </label>
            <div class="actions">
                <button id="submitContactInfo">保存联系信息</button>
            </div>
            <pre id="contactInfoResult">等待提交</pre>
        `;
        container.querySelector('.tool-back').onclick = context.back;
        container.querySelector('#submitContactInfo').onclick = async () => {
          const phone = container.querySelector('#contactPhone').value.trim();
          const email = container.querySelector('#contactEmail').value.trim();
          const qq = container.querySelector('#contactQQ').value.trim();
          const wx = container.querySelector('#contactWX').value.trim();
          const result = container.querySelector('#contactInfoResult');
          if (!phone || !email) {
            result.textContent = '请至少填写手机号和邮箱';
            return;
          }
          result.textContent = '正在提交...';
          try {
            const response = await context.request({
              method: 'POST',
              url: 'https://plat.hxxy.edu.cn/welcome/WelcomeAppMStudent/PhonePost',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
              },
              body: new URLSearchParams({
                Phone: phone,
                Email: email,
                QQ: qq,
                WXName: wx
              }).toString()
            });
            if (response.error) {
              result.textContent = `请求失败：${response.error}`;
              return;
            }
            let json;
            try {
              json = JSON.parse(response.text);
            } catch (e) {
              context.showResult(result, response);
              return;
            }
            const message = json && (json.msg || json.message);
            result.textContent = json && json.isok === true
              ? `保存成功${message ? `：${message}` : ''}`
              : `保存失败${message ? `：${message}` : `：HTTP ${response.status}`}`;
          } catch (e) {
            result.textContent = `提交异常：${e.message}`;
          }
        };
      }
    },
  ];
  // ---------- 自动任务：后台轮询 销假 / 活动签到签退 / 假期登记 / 晚寝签到 ----------
  const AUTO_INTERVAL_MIN = 1000;
  const AUTO_DEFAULT_INTERVAL = 30000;
  const AUTO_BATCH_SIZE = 10;
  const autoTasksState = {
    running: false,
    timer: null,
    roundCount: 0,
    successKeys: new Set(),
    stats: {
      leave: 0,
      activitySignin: 0,
      activitySignout: 0,
      holidayLeave: 0,
      holidayArrive: 0,
      holidayBack: 0,
      punch: 0,
      errors: 0
    },
    logs: [],
    ui: null
  };
  function autoLog(text) {
    const line = `${new Date().toLocaleTimeString()} ${text}`;
    autoTasksState.logs.push(line);
    if (autoTasksState.logs.length > 200) autoTasksState.logs.splice(0, autoTasksState.logs.length - 200);
    if (autoTasksState.ui && autoTasksState.ui.container && autoTasksState.ui.container.isConnected) autoTasksState.ui.update();
  }
  function autoSleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  function isTruthyValue(value) {
    return value === true || value === 1 || value === '1' || value === '是' || value === 'Y' || value === 'y';
  }
  function isWithinTimeWindow(startText, endText) {
    const now = Date.now();
    const start = startText ? Date.parse(String(startText).replace('T', ' ')) : NaN;
    const end = endText ? Date.parse(String(endText).replace('T', ' ')) : NaN;
    if (!Number.isNaN(start) && now < start) return false;
    if (!Number.isNaN(end) && now > end) return false;
    return true;
  }
  function autoSucceeded(json) {
    return Boolean(json && (json.isok === true || json.code === 0));
  }
  function autoMessage(json) {
    if (!json || typeof json !== 'object') return '未知返回';
    return String(json.msg || json.message || json.Message || (autoSucceeded(json) ? '成功' : '失败'));
  }
  async function autoPost(context, url, data) {
    const response = await context.request({
      method: 'POST',
      url,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: new URLSearchParams(data).toString()
    });
    if (response.error) throw new Error(response.error);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return JSON.parse(response.text);
  }
  // 销假：查询请假记录并逐条提交销假
  async function autoRunLeave(context, address) {
    const json = await autoPost(context, 'https://plat.hxxy.edu.cn/studentwork/VApply/GetVList', {
      key: '', page: '1', rows: '1000', askLeaveStatus: '-10'
    });
    const data = Array.isArray(json.data) ? json.data : [];
    for (const item of data) {
      const id = item.id;
      if (id == null || autoTasksState.successKeys.has('leave:' + id)) continue;
      const useAddress = (item.cancelplace && String(item.cancelplace).trim()) || (address && String(address).trim());
      if (!useAddress) {
        autoLog(`[销假] ${id} 无销假地址，跳过`);
        continue;
      }
      try {
        const result = await autoPost(context, 'https://plat.hxxy.edu.cn/studentwork/VApply/SubmitSignin', { id, address: useAddress });
        if (autoSucceeded(result)) {
          autoTasksState.successKeys.add('leave:' + id);
          autoTasksState.stats.leave++;
          autoLog(`[销假] ${id} 成功`);
        } else {
          autoTasksState.stats.errors++;
          autoLog(`[销假] ${id} 失败：${autoMessage(result)}`);
        }
      } catch (e) {
        autoTasksState.stats.errors++;
        autoLog(`[销假] ${id} 异常：${e.message}`);
      }
    }
  }
  // 学生活动：时间窗口内且未签到/未签退时自动执行
  async function autoRunActivity(context) {
    const json = await autoPost(context, 'https://plat.hxxy.edu.cn/studentwork/lessonactivity/getlessonstudentactivitycenterlist', {
      AcademicYear: '0', Semester: '0', ProjectCategoryType: '0', ProjectType: '0', ActivityType: '0', ActivityLevel: '0',
      Sponsor: '', Organizer: '', ActivityStatue: '0', key: '', _search: 'false', nd: '', rows: '200', page: '1', sidx: '', sord: 'asc'
    });
    const data = Array.isArray(json.data) ? json.data : [];
    for (const item of data) {
      const id = item.id;
      if (id == null || !isWithinTimeWindow(item.begindate, item.enddate)) continue;
      if (!isTruthyValue(item.issignin) && !autoTasksState.successKeys.has('act-signin:' + id)) {
        try {
          const result = await autoPost(context, 'https://plat.hxxy.edu.cn/studentwork/LessonActivityMobile/SubmitStuActSignUpSanCodeSignin', { ActivityId: id });
          if (autoSucceeded(result)) {
            autoTasksState.successKeys.add('act-signin:' + id);
            autoTasksState.stats.activitySignin++;
            autoLog(`[活动签到] ${id} 成功`);
          } else {
            autoTasksState.stats.errors++;
            autoLog(`[活动签到] ${id} 失败：${autoMessage(result)}`);
          }
        } catch (e) {
          autoTasksState.stats.errors++;
          autoLog(`[活动签到] ${id} 异常：${e.message}`);
        }
      }
      if (!isTruthyValue(item.issignout) && !autoTasksState.successKeys.has('act-signout:' + id)) {
        try {
          const result = await autoPost(context, 'https://plat.hxxy.edu.cn/studentwork/LessonActivityMobile/SubmitStuActSignUpScanCodeSignOut', { ActivityId: id });
          if (autoSucceeded(result)) {
            autoTasksState.successKeys.add('act-signout:' + id);
            autoTasksState.stats.activitySignout++;
            autoLog(`[活动签退] ${id} 成功`);
          } else {
            autoTasksState.stats.errors++;
            autoLog(`[活动签退] ${id} 失败：${autoMessage(result)}`);
          }
        } catch (e) {
          autoTasksState.stats.errors++;
          autoLog(`[活动签退] ${id} 异常：${e.message}`);
        }
      }
    }
  }
  // 假期登记：离校/到达（详情页 ID）与返校
  async function autoRunHoliday(context) {
    const json = await autoPost(context, 'https://me.hxxy.edu.cn/studentwork/HStudent/_HolidayActiveList', {
      key: '', page: '1', rows: '100', schoolyear: '-1'
    });
    const data = Array.isArray(json.data) ? json.data : [];
    for (const activity of data) {
      const id = activity.id;
      if (id == null) continue;
      const leaveKey = 'holiday-leave:' + id;
      const arriveKey = 'holiday-arrive:' + id;
      if (!autoTasksState.successKeys.has(leaveKey) || !autoTasksState.successKeys.has(arriveKey)) {
        let detailIds = [];
        try {
          const detailResponse = await context.request({
            method: 'GET',
            url: `https://me.hxxy.edu.cn/studentwork/vHStudent/VLeave?id=${encodeURIComponent(id)}`
          });
          if (!detailResponse.error && detailResponse.ok) {
            const seen = new Set();
            const pattern = /btn(?:LeaveSchoolRevoke|Arrive|LeaveSchool)\(\s*['"]?(\d+)['"]?\s*\)/g;
            let match;
            while ((match = pattern.exec(detailResponse.text)) !== null) {
              if (!seen.has(match[1])) {
                seen.add(match[1]);
                detailIds.push(match[1]);
              }
            }
          }
        } catch (e) {
          autoTasksState.stats.errors++;
          autoLog(`[假期] ${id} 详情解析异常：${e.message}`);
        }
        for (const detailId of detailIds) {
          if (!autoTasksState.successKeys.has(leaveKey)) {
            try {
              const result = await autoPost(context, 'https://me.hxxy.edu.cn/studentwork/HStudent/Save_Leave', { id: detailId });
              if (autoSucceeded(result)) {
                autoTasksState.successKeys.add(leaveKey);
                autoTasksState.stats.holidayLeave++;
                autoLog(`[离校] ${id} 成功`);
              } else {
                autoTasksState.stats.errors++;
                autoLog(`[离校] ${id} 失败：${autoMessage(result)}`);
              }
            } catch (e) {
              autoTasksState.stats.errors++;
              autoLog(`[离校] ${id} 异常：${e.message}`);
            }
          }
          if (!autoTasksState.successKeys.has(arriveKey)) {
            try {
              const result = await autoPost(context, 'https://me.hxxy.edu.cn/studentwork/HStudent/Save_Arrive', {
                id: detailId,
                address: '',
                longitudeGaoDe: '118.077544',
                latitudeGaoDe: '24.633716',
                arriveCode: '0'
              });
              if (autoSucceeded(result)) {
                autoTasksState.successKeys.add(arriveKey);
                autoTasksState.stats.holidayArrive++;
                autoLog(`[到达] ${id} 成功`);
              } else {
                autoTasksState.stats.errors++;
                autoLog(`[到达] ${id} 失败：${autoMessage(result)}`);
              }
            } catch (e) {
              autoTasksState.stats.errors++;
              autoLog(`[到达] ${id} 异常：${e.message}`);
            }
          }
        }
      }
      const backKey = 'holiday-back:' + id;
      if (!autoTasksState.successKeys.has(backKey)) {
        try {
          const result = await autoPost(context, 'https://me.hxxy.edu.cn/studentwork/vHStudent/SubmitSignin', {
            id,
            address: '厦门华夏',
            longitudeGaoDe: '118.077544',
            latitudeGaoDe: '24.633716'
          });
          if (autoSucceeded(result)) {
            autoTasksState.successKeys.add(backKey);
            autoTasksState.stats.holidayBack++;
            autoLog(`[返校] ${id} 成功`);
          } else {
            autoTasksState.stats.errors++;
            autoLog(`[返校] ${id} 失败：${autoMessage(result)}`);
          }
        } catch (e) {
          autoTasksState.stats.errors++;
          autoLog(`[返校] ${id} 异常：${e.message}`);
        }
      }
    }
  }
  // 晚寝签到
  async function autoRunPunch(context) {
    const urls = [
      'https://plat.hxxy.edu.cn/studentwork/PunchMStudent/GetActivityList',
      'https://plat.hxxy.edu.cn/studentwork/PunchMTeacher/_TableList'
    ];
    let data = [];
    for (const url of urls) {
      try {
        const json = await autoPost(context, url, { page: '1', size: '1000' });
        if (json.isok !== false && Array.isArray(json.data)) {
          data = json.data;
          break;
        }
      } catch (e) {}
    }
    for (const item of data) {
      const id = item.id;
      if (id == null || autoTasksState.successKeys.has('punch:' + id)) continue;
      try {
        const result = await autoPost(context, 'https://plat.hxxy.edu.cn/studentwork/PunchMStudent/SubmitSignin', { ActivityId: id });
        if (autoSucceeded(result)) {
          autoTasksState.successKeys.add('punch:' + id);
          autoTasksState.stats.punch++;
          autoLog(`[晚寝] ${id} 成功`);
        } else {
          autoTasksState.stats.errors++;
          autoLog(`[晚寝] ${id} 失败：${autoMessage(result)}`);
        }
      } catch (e) {
        autoTasksState.stats.errors++;
        autoLog(`[晚寝] ${id} 异常：${e.message}`);
      }
    }
  }
  async function autoRunRound(context, tasks) {
    if (tasks.leave) {
      try { await autoRunLeave(context, config.autoConfig.address); } catch (e) { autoTasksState.stats.errors++; autoLog(`[销假] 轮询异常：${e.message}`); }
    }
    if (tasks.activity) {
      try { await autoRunActivity(context); } catch (e) { autoTasksState.stats.errors++; autoLog(`[活动] 轮询异常：${e.message}`); }
    }
    if (tasks.holiday) {
      try { await autoRunHoliday(context); } catch (e) { autoTasksState.stats.errors++; autoLog(`[假期] 轮询异常：${e.message}`); }
    }
    if (tasks.punch) {
      try { await autoRunPunch(context); } catch (e) { autoTasksState.stats.errors++; autoLog(`[晚寝] 轮询异常：${e.message}`); }
    }
  }
  function autoTasksFromConfig() {
    return {
      leave: config.autoConfig.leave,
      activity: config.autoConfig.activity,
      holiday: config.autoConfig.holiday,
      punch: config.autoConfig.punch
    };
  }
  function autoNotifyUi() {
    if (autoTasksState.ui && autoTasksState.ui.container && autoTasksState.ui.container.isConnected) autoTasksState.ui.update();
  }
  async function autoRunOneRound(context) {
    autoTasksState.roundCount++;
    autoLog(`开始第 ${autoTasksState.roundCount} 轮自动任务`);
    await autoRunRound(context, autoTasksFromConfig());
    autoLog(`第 ${autoTasksState.roundCount} 轮完成`);
    autoNotifyUi();
  }
  function autoStartTasks(context) {
    autoTasksState.running = true;
    autoTasksState.roundCount = 0;
    autoTasksState.successKeys.clear();
    autoTasksState.stats = { leave: 0, activitySignin: 0, activitySignout: 0, holidayLeave: 0, holidayArrive: 0, holidayBack: 0, punch: 0, errors: 0 };
    autoTasksState.logs = [];
    autoNotifyUi();
    autoRunOneRound(context);
    if (autoTasksState.timer) window.clearInterval(autoTasksState.timer);
    autoTasksState.timer = window.setInterval(() => autoRunOneRound(context), config.autoConfig.interval);
    localLog('log', `自动任务已启动，每 ${config.autoConfig.interval}ms 轮询一次`);
  }
  function autoStopTasks() {
    autoTasksState.running = false;
    if (autoTasksState.timer) {
      window.clearInterval(autoTasksState.timer);
      autoTasksState.timer = null;
    }
    autoLog('自动任务已停止');
    localLog('log', '自动任务已停止');
    autoNotifyUi();
  }
  function renderAutoTasks(container, context) {
    container.innerHTML = `
      <div class="tool-head"><button class="secondary tool-back">返回工具箱</button><h4>自动任务</h4></div>
      <div class="auto-config">
        <div class="auto-toggles">
          <label><input type="checkbox" id="autoLeave"> 销假</label>
          <label><input type="checkbox" id="autoActivity"> 活动签到签退</label>
          <label><input type="checkbox" id="autoHoliday"> 假期登记(离校/到达/返校)</label>
          <label><input type="checkbox" id="autoPunch"> 晚寝签到</label>
        </div>
        <label>销假默认地址<input id="autoAddress" placeholder="记录无地址时使用，如：厦门华夏"></label>
        <label>轮询间隔(毫秒)<input id="autoInterval" type="number" value="${config.autoConfig.interval}" min="${AUTO_INTERVAL_MIN}"></label>
        <label class="auto-start-on-load"><input type="checkbox" id="autoStartOnLoad"> 脚本启动时自动启动</label>
      </div>
      <div class="actions">
        <button id="autoStart">开始自动任务</button>
        <button id="autoRunOnce" class="secondary">立即执行一轮</button>
        <button id="autoStop" class="danger" disabled>停止</button>
      </div>
      <div id="autoStatus" class="auto-status"></div>
      <div id="autoStats" class="auto-stats"></div>
      <div id="autoLog" class="auto-log"></div>
    `;
    container.querySelector('.tool-back').onclick = context.back;
    const style = document.createElement('style');
    style.textContent = `
      .auto-config{border:1px solid #cbd5e1;border-radius:9px;padding:10px;background:#f8fafc;margin-top:8px}
      .auto-toggles{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:6px}
      .auto-toggles label{display:inline-flex;align-items:center;gap:4px;margin:0}
      .auto-start-on-load{display:inline-flex;align-items:center;gap:4px;margin-top:2px}
      .auto-status{margin-top:8px;font-size:12px;color:#334155;white-space:pre-wrap}
      .auto-stats{margin-top:6px;font-size:12px;color:#475569;white-space:pre-wrap}
      .auto-log{margin-top:8px;max-height:200px;overflow:auto;font-size:11px;color:#64748b;white-space:pre-wrap;word-break:break-word;border-top:1px solid #e2e8f0;padding-top:6px}
    `;
    container.appendChild(style);
    const statusEl = container.querySelector('#autoStatus');
    const statsEl = container.querySelector('#autoStats');
    const logEl = container.querySelector('#autoLog');
    const startBtn = container.querySelector('#autoStart');
    const stopBtn = container.querySelector('#autoStop');
    const update = () => {
      const s = autoTasksState.stats;
      statusEl.textContent = autoTasksState.running
        ? `状态：运行中（已执行 ${autoTasksState.roundCount} 轮，每 ${config.autoConfig.interval}ms 轮询）`
        : `状态：${autoTasksState.roundCount > 0 ? `已停止（共执行 ${autoTasksState.roundCount} 轮）` : '未启动'}`;
      statsEl.textContent = [
        `销假成功：${s.leave}`,
        `活动签到：${s.activitySignin}  活动签退：${s.activitySignout}`,
        `离校：${s.holidayLeave}  到达：${s.holidayArrive}  返校：${s.holidayBack}`,
        `晚寝签到：${s.punch}  失败/异常：${s.errors}`
      ].join('\n');
      logEl.textContent = autoTasksState.logs.slice(-60).join('\n') || '暂无日志';
      logEl.scrollTop = logEl.scrollHeight;
      startBtn.disabled = autoTasksState.running;
      stopBtn.disabled = !autoTasksState.running;
    };
    autoTasksState.ui = { container, update };
    container.querySelector('#autoLeave').checked = config.autoConfig.leave;
    container.querySelector('#autoActivity').checked = config.autoConfig.activity;
    container.querySelector('#autoHoliday').checked = config.autoConfig.holiday;
    container.querySelector('#autoPunch').checked = config.autoConfig.punch;
    container.querySelector('#autoAddress').value = config.autoConfig.address || '';
    container.querySelector('#autoInterval').value = config.autoConfig.interval;
    container.querySelector('#autoStartOnLoad').checked = !!config.autoConfig.autoStartOnLoad;
    const saveForm = () => {
      config.autoConfig.leave = container.querySelector('#autoLeave').checked;
      config.autoConfig.activity = container.querySelector('#autoActivity').checked;
      config.autoConfig.holiday = container.querySelector('#autoHoliday').checked;
      config.autoConfig.punch = container.querySelector('#autoPunch').checked;
      config.autoConfig.address = container.querySelector('#autoAddress').value.trim();
      config.autoConfig.interval = Math.max(AUTO_INTERVAL_MIN, Number(container.querySelector('#autoInterval').value) || AUTO_DEFAULT_INTERVAL);
      config.autoConfig.autoStartOnLoad = container.querySelector('#autoStartOnLoad').checked;
      saveConfig();
    };
    startBtn.onclick = () => {
      saveForm();
      autoStartTasks(context);
    };
    stopBtn.onclick = autoStopTasks;
    container.querySelector('#autoRunOnce').onclick = () => {
      saveForm();
      autoRunOneRound(context);
    };
    update();
  }
  // 主动API请求层，绕过页面CORS限制；页面Hook仍然使用原生XHR/fetch。
  function requestWithCurrentIdentity(options) {
    const start = performance.now();
    const method = String(options.method || 'GET').toUpperCase();
    const withCredentials = options.withCredentials !== false;
    let requestUrl;
    try {
      requestUrl = new URL(String(options.url || ''), window.location.href).href;
    } catch (error) {
      return Promise.resolve({
        ok: false,
        status: 0,
        statusText: '',
        duration: 0,
        text: '',
        error: 'URL格式无效'
      });
    }
    let data;
    if (options.body != null) {
      if (typeof options.body === 'string') data = options.body;
      else if (options.body instanceof URLSearchParams) data = options.body.toString();
      else data = JSON.stringify(options.body);
    }
    return new Promise(resolve => {
      const finish = (response, error) => {
        const status = Number(response && response.status) || 0;
        resolve({
          ok: status >= 200 && status < 300,
          status,
          statusText: response && response.statusText ? response.statusText : '',
          duration: Math.round(performance.now() - start),
          text: response && response.responseText != null ? String(response.responseText) : '',
          responseHeaders: response && response.responseHeaders ? String(response.responseHeaders) : '',
          ...(error ? {
            error
          } : {})
        });
      };
      try {
        GM_xmlhttpRequest({
          method,
          url: requestUrl,
          headers: Object.assign({}, options.headers || {}),
          data,
          responseType: 'text',
          withCredentials,
          anonymous: !withCredentials,
          onload: response => finish(response),
          onerror: response => finish(response, '网络请求失败'),
          ontimeout: response => finish(response, '请求超时'),
          onabort: response => finish(response, '请求已取消')
        });
      } catch (error) {
        finish(null, String(error));
      }
    });
  }
  function inspectDiagnosticResponse(response) {
    const text = response && response.text != null ? String(response.text) : '';
    const trimmed = text.trim();
    const headers = response && response.responseHeaders ? String(response.responseHeaders) : '';
    const contentTypeMatch = headers.match(/^content-type\s*:\s*([^\r\n]+)/im);
    const contentType = contentTypeMatch ? contentTypeMatch[1].trim() : '';
    const htmlByHeader = /(?:text\/html|application\/xhtml\+xml)/i.test(contentType);
    const htmlByMarkup = /^\s*(?:<!--[\s\S]{0,300}?-->\s*)?(?:<!doctype\s+html|<(?:html|head|body|form|script|meta|title|div)\b)/i.test(text);
    const isHtml = htmlByHeader || htmlByMarkup;
    const loginPage = isHtml && /(?:登录|登陆|统一身份认证|login|sign[ -]?in|password)/i.test(text.slice(0, 5000));
    const errorPage = isHtml && ((response && response.status >= 400) || /(?:错误|异常|无权限|拒绝访问|error|exception|access denied|forbidden|not found)/i.test(text.slice(0, 5000)));
    let isJson = false;
    let jsonError = '';
    if (trimmed && !isHtml) {
      try {
        JSON.parse(trimmed);
        isJson = true;
      } catch (error) {
        jsonError = error && error.message ? error.message : String(error);
      }
    }
    const statusOk = !!response && response.status >= 200 && response.status < 300;
    const transportError = response && response.error ? String(response.error) : '';
    let reason = '';
    if (transportError) reason = transportError;
    else if (!statusOk) reason = `HTTP状态异常：${response ? response.status : 0}`;
    else if (isHtml) reason = loginPage ? '返回HTML登录页，当前请求未携带有效登录状态' : (errorPage ? '返回HTML错误页' : '返回HTML页面');
    else if (!isJson) reason = trimmed ? `返回内容不是有效JSON${jsonError ? `：${jsonError}` : ''}` : '响应内容为空，不是有效JSON';
    return {
      valid: !transportError && statusOk && isJson && !isHtml,
      status: response ? response.status : 0,
      statusText: response && response.statusText ? response.statusText : '',
      duration: response && response.duration != null ? response.duration : 0,
      contentType,
      isJson,
      isHtml,
      loginPage,
      errorPage,
      reason,
      preview: text.slice(0, 500)
    };
  }
  async function requestWithFetchCurrentIdentity(options) {
    const start = performance.now();
    const timeoutMs = 20000;
    let requestUrl;
    try {
      requestUrl = new URL(String(options.url || ''), window.location.href).href;
    } catch (error) {
      return { ok: false, status: 0, statusText: '', duration: 0, text: '', responseHeaders: '', error: 'URL格式无效' };
    }
    const method = String(options.method || 'GET').toUpperCase();
    let body;
    if (options.body != null) {
      if (typeof options.body === 'string') body = options.body;
      else if (options.body instanceof URLSearchParams) body = options.body.toString();
      else body = JSON.stringify(options.body);
    }
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
      let response;
      try {
        response = await fetch(requestUrl, {
          method,
          headers: Object.assign({}, options.headers || {}),
          body: method === 'GET' || method === 'HEAD' ? undefined : body,
          credentials: 'include',
          cache: 'no-store',
          ...(controller ? { signal: controller.signal } : {})
        });
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
      const text = await response.text();
      const responseHeaders = Array.from(response.headers.entries()).map(([key, value]) => `${key}: ${value}`).join('\n');
      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText || '',
        duration: Math.round(performance.now() - start),
        text,
        responseHeaders
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        statusText: '',
        duration: Math.round(performance.now() - start),
        text: '',
        responseHeaders: '',
        error: error && error.name === 'AbortError'
          ? `fetch请求超时（${timeoutMs}ms）`
          : (error && error.message ? error.message : String(error))
      };
    }
  }
  async function runIOSRequestDiagnostic(options) {
    const attempts = [];
    const gmTimeoutMs = 20000;
    const gmResponse = await Promise.race([
      requestWithCurrentIdentity(Object.assign({}, options, { withCredentials: true })),
      new Promise(resolve => setTimeout(() => resolve({
        ok: false,
        status: 0,
        statusText: '',
        duration: gmTimeoutMs,
        text: '',
        responseHeaders: '',
        error: `GM_xmlhttpRequest未在${gmTimeoutMs}ms内返回`
      }), gmTimeoutMs))
    ]);
    const gmInspection = inspectDiagnosticResponse(gmResponse);
    attempts.push({ transport: 'GM_xmlhttpRequest (withCredentials)', response: gmResponse, inspection: gmInspection });
    if (gmInspection.valid) return { success: true, fallbackUsed: false, attempts };
    const fetchResponse = await requestWithFetchCurrentIdentity(options);
    const fetchInspection = inspectDiagnosticResponse(fetchResponse);
    attempts.push({ transport: 'fetch (credentials: include)', response: fetchResponse, inspection: fetchInspection });
    return { success: fetchInspection.valid, fallbackUsed: true, attempts };
  }
  function formatIOSDiagnosticReport(result, options) {
    const environment = [
      `脚本版本：${VERSION}`,
      `当前地址：${window.location.href}`,
      `User-Agent：${RUNTIME_ENVIRONMENT.userAgent}`,
      `Platform：${RUNTIME_ENVIRONMENT.platform || '(空)'}`,
      `Vendor：${RUNTIME_ENVIRONMENT.vendor || '(空)'}`,
      `Language：${RUNTIME_ENVIRONMENT.language || '(空)'}`,
      `MaxTouchPoints：${RUNTIME_ENVIRONMENT.maxTouchPoints}`,
      `是否iOS：${RUNTIME_ENVIRONMENT.isIOS ? '是' : '否'}`,
      `测试请求：${options.method} ${new URL(options.url, window.location.href).href}`
    ];
    const attempts = result.attempts.map((attempt, index) => {
      const item = attempt.inspection;
      return [
        `\n方案 ${index === 0 ? 'A' : 'B'}：${attempt.transport}`,
        `HTTP状态：${item.status} ${item.statusText || ''}`.trimEnd(),
        `耗时：${item.duration}ms`,
        `Content-Type：${item.contentType || '(未提供)'}`,
        `是否JSON：${item.isJson ? '是' : '否'}`,
        `是否HTML：${item.isHtml ? '是' : '否'}`,
        `HTML登录页：${item.loginPage ? '是' : '否'}`,
        `HTML错误页：${item.errorPage ? '是' : '否'}`,
        `校验结果：${item.valid ? '通过' : `失败 - ${item.reason || '未知原因'}`}`,
        '返回内容前500字符：',
        item.preview || '(空响应)'
      ].join('\n');
    });
    const outcome = result.success
      ? `\n最终结果：成功，使用 ${result.attempts[result.attempts.length - 1].transport}`
      : `\n最终结果：失败，GM_xmlhttpRequest 与 fetch 均未返回有效JSON；请保留本报告用于定位 Cookie、CORS 或登录状态问题。`;
    return environment.concat(attempts, outcome).join('\n');
  }
  function renderInternalPage(container, title, url, back, fallback) {
    container.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'tool-head';
    const backButton = document.createElement('button');
    backButton.className = 'secondary';
    backButton.textContent = '返回';
    backButton.onclick = back;
    const heading = document.createElement('h4');
    heading.textContent = title;
    head.appendChild(backButton);
    head.appendChild(heading);
    if (typeof fallback === 'function') {
      const fallbackButton = document.createElement('button');
      fallbackButton.className = 'secondary';
      fallbackButton.textContent = '改用二维码接口';
      fallbackButton.onclick = fallback;
      head.appendChild(fallbackButton);
    }
    const frameViewport = document.createElement('div');
    frameViewport.className = 'internal-page-viewport';
    frameViewport.style.cssText = `
        position:relative;
        width:100%;
        height:min(62vh,560px);
        min-height:260px;
        overflow:hidden;
        border:1px solid #cbd5e1;
        border-radius:6px;
        background:#fff;
        contain:strict;
        margin:0 auto;
    `;
    const frame = document.createElement('iframe');
    frame.className = 'internal-page-frame';
    frame.src = new URL(url, window.location.href).href;
    frame.title = title;
    frame.setAttribute('scrolling', 'yes');
    frame.style.cssText = `
        display:block;
        position:absolute;
        top:0;
        left:50%;
        width:160%;
        height:160%;
        max-width:none;
        border:0;
        background:#fff;
        transform:translateX(-50%) scale(.625);
        transform-origin:top center;
    `;
    if (typeof fallback === 'function') frame.addEventListener('error', fallback, { once: true });
    frameViewport.appendChild(frame);
    container.appendChild(head);
    container.appendChild(frameViewport);
}
  function renderToolbox(container) {
    container.innerHTML = '<h4>工具箱</h4><div class="toolbox-list"></div><div class="toolbox-host"></div>';
    const list = container.querySelector('.toolbox-list');
    const host = container.querySelector('.toolbox-host');
    toolboxTools.forEach(tool => {
      const row = document.createElement('div');
      row.className = 'tool-item';
      row.innerHTML = `<div><b>${esc(tool.name)}</b><small>${esc(tool.description || '')}</small></div><button>打开</button>`;
      row.querySelector('button').onclick = () => {
        list.style.display = 'none';
        const toolContext = {
          request: requestWithCurrentIdentity,
          showResult: (target, response) => {
            if (response.error) {
              target.textContent = `请求失败\n${response.error}`;
              return;
            }
            target.textContent = `Status: ${response.status} ${response.statusText || ''}\nTime: ${response.duration}ms\n\n${formatResponse(response.text)}`;
          },
          openInternalPage: (title, url, fallback) => renderInternalPage(host, title, url, () => tool.render(host, toolContext), fallback),
          reload: () => tool.render(host, toolContext),
          back: () => renderToolbox(container)
        };
        tool.render(host, toolContext);
      };
      list.appendChild(row);
    });
  }
  function getApiForm(container) {
    return {
      name: container.querySelector('#apiName').value.trim(),
      method: container.querySelector('#apiMethod').value,
      url: container.querySelector('#apiUrl').value.trim(),
      headers: container.querySelector('#apiHeaders').value,
      body: container.querySelector('#apiBody').value
    };
  }
  function bodyToQueryString(body) {
    if (body == null || body === '') return '';
    if (body instanceof URLSearchParams) return body.toString();
    if (typeof body === 'string') {
      const text = body.trim();
      if (!text) return '';
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return new URLSearchParams(Object.entries(parsed).flatMap(([key, value]) => {
            const values = Array.isArray(value) ? value : [value];
            return values.map(item => [key, item == null ? '' : String(item)]);
          })).toString();
        }
      } catch (e) {}
      return detectBodyType(text) ? parseRawBody(text).toString() : text;
    }
    if (typeof body === 'object') return new URLSearchParams(Object.entries(body).map(([key, value]) => [key, value == null ? '' : String(value)])).toString();
    return String(body);
  }
  function appendQueryToUrl(rawUrl, body) {
    const url = new URL(String(rawUrl || ''), window.location.href);
    const query = bodyToQueryString(body);
    if (query) {
      const params = new URLSearchParams(query);
      params.forEach((value, key) => url.searchParams.append(key, value));
    }
    return url.href;
  }
  function renderApiTest(container, api) {
    const item = api || {
      name: '',
      method: 'GET',
      url: '',
      headers: '{}',
      body: ''
    };
    container.innerHTML = `<h4>API调试 <small style="color:#64748b">支持 m.hxxy.edu.cn 老式PHP接口（返回HTML也会记录）</small></h4><label>名称<input id="apiName" placeholder="例如：活动检查接口"></label><label>类型<select id="apiMethod"><option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option></select></label><label>接口<input id="apiUrl" placeholder="https://m.hxxy.edu.cn/xxx.php 或 /studentwork/api"></label><label>请求头<textarea id="apiHeaders" rows="3">{}</textarea></label><label>数据<textarea id="apiBody" rows="6" placeholder="Statues=0&key=&Year=2627&Term=0&_search=false&nd=1784946876240&rows=12&page=1&sidx=&sord=asc"></textarea></label><div class="actions"><button id="sendApi">发送请求</button><button class="secondary" id="saveApi">保存API</button><button class="secondary" id="loadApi">加载API</button></div><div id="savedApiList"></div><pre id="apiResult">等待请求</pre>`;
    setInput(container, 'apiName', item.name);
    setInput(container, 'apiMethod', item.method);
    setInput(container, 'apiUrl', item.url);
    setInput(container, 'apiHeaders', item.headers || '{}');
    setInput(container, 'apiBody', item.body || '');
    container.querySelector('#saveApi').onclick = () => {
      const form = getApiForm(container);
      if (!form.name) {
        alertInPanel(container, '请填写API名称');
        return;
      }
      const saved = Object.assign({
        id: 'api-' + Date.now()
      }, form);
      const index = config.savedApis.findIndex(x => x.name === form.name);
      if (index >= 0) config.savedApis[index] = Object.assign(config.savedApis[index], saved);
      else config.savedApis.push(saved);
      saveConfig();
      renderSavedApis(container);
      alertInPanel(container, 'API已保存');
    };
    container.querySelector('#loadApi').onclick = () => renderSavedApis(container);
    container.querySelector('#sendApi').onclick = async () => {
      const form = getApiForm(container);
      const result = container.querySelector('#apiResult');
      if (!form.url) {
        result.textContent = '请输入URL';
        return;
      }
      const headers = parseHeaders(form.headers);
      if (!headers) {
        result.textContent = 'Headers不是有效JSON';
        return;
      }
      const normalized = normalizeBody(form.body, headers);
      const method = String(form.method || 'GET').toUpperCase();
      let actualUrl = form.url;
      const options = {
        method,
        url: form.url,
        headers: normalized.headers,
        withCredentials: true
      };
      if (form.body && method === 'GET') {
        try {
          actualUrl = appendQueryToUrl(form.url, normalized.body);
          options.url = actualUrl;
        } catch (e) {
          result.textContent = `GET 参数转换失败：${e.message}`;
          return;
        }
      } else if (form.body) {
        options.body = normalized.body;
      }
      result.textContent = `正在请求...\n${method} ${actualUrl}`;
      const response = await requestWithCurrentIdentity(options);
      if (response.error) {
        result.textContent = `请求失败\n${response.error}`;
        return;
      }
      result.textContent = `实际请求：${method} ${actualUrl}\nStatus: ${response.status} ${response.statusText || ''}\nTime: ${response.duration}ms\n\n${formatResponse(response.text)}`;
    };
    renderSavedApis(container);
  }
  function alertInPanel(container, text) {
    const result = container.querySelector('#apiResult');
    if (result) {
      result.textContent = text;
      return;
    }
    let notice = container.querySelector('.panel-notice');
    if (!notice) {
      notice = document.createElement('div');
      notice.className = 'panel-notice';
      notice.style.cssText = 'margin:6px 0;padding:7px 8px;border:1px solid #93c5fd;border-radius:6px;background:#eff6ff;white-space:pre-wrap;word-break:break-word;font-size:12px;';
      container.insertBefore(notice, container.firstChild);
    }
    notice.textContent = text;
  }
  async function copyCurrentCookies(container) {
    const cookies = (document.cookie || '').split(';').map(item => item.trim()).filter(Boolean).join(';') + (document.cookie ? ';' : '');
    if (!cookies) {
      alertInPanel(container, '当前页面没有可读取的 Cookies（HttpOnly Cookie 无法被脚本读取）');
      return;
    }
    try {
      await navigator.clipboard.writeText(cookies);
      alertInPanel(container, `Cookies 已复制（${cookies.split(';').filter(Boolean).length} 项）`);
    } catch (e) {
      const input = document.createElement('textarea');
      input.value = cookies;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.focus();
      input.select();
      let copied = false;
      try { copied = document.execCommand('copy'); } catch (error) {}
      input.remove();
      alertInPanel(container, copied ? 'Cookies 已复制' : `Cookies：\n${cookies}`);
    }
  }
  function renderSavedApis(container) {
    const list = container.querySelector('#savedApiList');
    if (!list) return;
    list.innerHTML = config.savedApis.length ? '<h4>已保存API</h4>' : '';
    config.savedApis.forEach(api => {
      const row = document.createElement('div');
      row.className = 'saved-api';
      row.innerHTML = `<span>${esc(api.name)} <small>${esc(api.method)} ${esc(api.url)}</small></span><button class="secondary load-one">加载</button><button class="danger delete-one">删除</button>`;
      row.querySelector('.load-one').onclick = () => renderApiTest(container, api);
      row.querySelector('.delete-one').onclick = () => {
        config.savedApis = config.savedApis.filter(x => x.id !== api.id);
        saveConfig();
        renderSavedApis(container);
      };
      list.appendChild(row);
    });
  }
  function saveLogAsApi(container, item) {
    const editor = container.querySelector('#logApiEditor');
    if (!editor) return;
    const name = editor.querySelector('#logApiName').value.trim();
    if (!name) {
      alertInPanel(container, '请填写保存的API名称');
      return;
    }
    config.savedApis.push({
      id: 'api-' + Date.now(),
      name,
      method: item.method,
      url: item.url,
      headers: '{}',
      body: item.requestBody || ''
    });
    saveConfig();
    editor.remove();
    renderPanel();
  }
  function queryToDataObject(rawQuery) {
    const data = {};
    new URLSearchParams(rawQuery || '').forEach((value, key) => {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        data[key] = Array.isArray(data[key]) ? data[key].concat(value) : [data[key], value];
      } else {
        data[key] = value;
      }
    });
    return data;
  }
  function splitUrlQueryToBody(rawUrl) {
    const original = String(rawUrl || '');
    try {
      const parsed = new URL(original, window.location.href);
      const body = JSON.stringify(queryToDataObject(parsed.searchParams.toString()), null, 2);
      parsed.search = '';
      return { url: parsed.href, body };
    } catch (e) {
      const index = original.indexOf('?');
      if (index < 0) return { url: original, body: '' };
      return { url: original.slice(0, index), body: JSON.stringify(queryToDataObject(original.slice(index + 1)), null, 2) };
    }
  }
  function addFormContentType(headers, body) {
    const next = Object.assign({}, headers || {});
    if (body && !Object.keys(next).some(key => key.toLowerCase() === 'content-type')) {
      next['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
    }
    return next;
  }
  const truncateForLog = (text, limit = 30000) => {
    const str = String(text == null ? '' : text);
    return str.length > limit ? str.slice(0, limit) + `\n...(已截断，共 ${str.length} 字符)` : str;
  };
  function renderLogDetail(container, item, row) {
    const old = row.querySelector('.log-detail');
    if (old) {
      old.remove();
      container.dataset.expandedLogId = '';
      return;
    }
    container.dataset.expandedLogId = item.id || '';
    const splitRequest = splitUrlQueryToBody(item.url);
    const initialBody = item.requestBody || splitRequest.body;
    const detail = document.createElement('div');
    detail.className = 'log-detail editor';
    detail.innerHTML = `<label>类型<select class="replay-method"><option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option><option>PATCH</option></select></label><label>接口<input class="replay-url"></label><label>请求头<textarea class="replay-headers" rows="4">{}</textarea></label><label>数据<textarea class="replay-body" rows="6"></textarea></label><div class="actions"><button class="replay-request">发起请求</button><button class="secondary save-detail-api">保存API</button></div><pre class="replay-result">原始响应：\n${esc(truncateForLog(formatResponse(item.originalResponse)))}\n\n修改后响应：\n${esc(truncateForLog(formatResponse(item.modifiedResponse)))}</pre>`;
    detail.querySelector('.replay-method').value = item.method || 'GET';
    detail.querySelector('.replay-url').value = splitRequest.url;
    detail.querySelector('.replay-body').value = initialBody;
    detail.querySelector('.replay-request').onclick = async () => {
      const result = detail.querySelector('.replay-result');
      const headers = parseHeaders(detail.querySelector('.replay-headers').value);
      if (!headers) {
        result.textContent = 'Headers 不是有效 JSON';
        return;
      }
      const method = detail.querySelector('.replay-method').value;
      const rawBody = detail.querySelector('.replay-body').value.trim();
      let body = rawBody;
      if (rawBody) {
        try {
          const data = JSON.parse(rawBody);
          if (data && typeof data === 'object' && !Array.isArray(data)) {
            body = new URLSearchParams(Object.entries(data).flatMap(([key, value]) => {
              const values = Array.isArray(value) ? value : [value];
              return values.map(item => [key, item == null ? '' : String(item)]);
            })).toString();
          }
        } catch (e) {}
      }
      const requestUrl = detail.querySelector('.replay-url').value.trim();
      let replayUrl = requestUrl;
      let replayBody = body;
      if (method === 'GET' && body) {
        try {
          const url = new URL(requestUrl, window.location.href);
          const params = new URLSearchParams(body);
          params.forEach((value, key) => url.searchParams.append(key, value));
          replayUrl = url.href;
          replayBody = undefined;
        } catch (e) {
          result.textContent = `GET 参数转换失败：${e.message}`;
          return;
        }
      }
      result.textContent = `正在重放请求...\n${method} ${replayUrl}`;
      const response = await requestWithCurrentIdentity({
        method,
        url: replayUrl,
        headers: method === 'GET' ? headers : addFormContentType(headers, body),
        body: replayBody,
        withCredentials: true
      });
      result.textContent = response.error ? `请求失败\n${response.error}` : `实际请求：${method} ${replayUrl}\nStatus: ${response.status} ${response.statusText || ''}\nTime: ${response.duration}ms\n\n${formatResponse(response.text)}`;
    };
    detail.querySelector('.save-detail-api').onclick = () => {
      const method = detail.querySelector('.replay-method').value;
      const url = detail.querySelector('.replay-url').value.trim();
      config.savedApis.push({
        id: 'api-' + Date.now(),
        name: `${method} ${url.split('?')[0]}`,
        method,
        url,
        headers: detail.querySelector('.replay-headers').value,
        body: detail.querySelector('.replay-body').value
      });
      saveConfig();
      detail.querySelector('.replay-result').textContent = '已保存到 API调试。';
    };
    row.appendChild(detail);
  }
  function renderLogs(container) {
    const expandedId = container.dataset.expandedLogId || '';
    container.dataset.view = 'logs';
    container.innerHTML = '<h4>API日志 <button class="danger" id="clearLogs">清空</button></h4><small>点击“API日志”按钮来刷新；点击日志条目可编辑重发。</small>';
    if (!logs.length) {
      container.insertAdjacentHTML('beforeend', '<div>暂无API日志</div>');
      return;
    }
    logs.slice(0, 50).forEach(item => {
      const row = document.createElement('div');
      row.className = 'log';
      row.innerHTML = `<div>${esc(item.time)}　${esc(item.method)}　${esc(item.status)}　${esc(item.duration)}ms　${item.modified ? 'Modified' : 'Original'}</div><small>${esc(item.url)}</small><button class="secondary save-log">保存API</button>`;
      row.querySelector('.save-log').onclick = e => {
        e.stopPropagation();
        const oldEditor = container.querySelector('#logApiEditor');
        if (oldEditor) oldEditor.remove();
        const editor = document.createElement('div');
        editor.id = 'logApiEditor';
        editor.className = 'editor';
        editor.innerHTML = `<label>API名称<input id="logApiName" value="${esc(item.method + ' ' + item.url.split('?')[0])}"></label><button class="secondary confirm-log-api">保存</button><button class="danger cancel-log-api">取消</button>`;
        editor.querySelector('.confirm-log-api').onclick = () => saveLogAsApi(container, item);
        editor.querySelector('.cancel-log-api').onclick = () => editor.remove();
        row.appendChild(editor);
      };
      row.onclick = e => {
        if (e.target.closest && (e.target.closest('button') || e.target.closest('.log-detail'))) return;
        renderLogDetail(container, item, row);
      };
      container.appendChild(row);
      if (expandedId && expandedId === item.id) renderLogDetail(container, item, row);
    });
    container.querySelector('#clearLogs').onclick = () => {
      logs = [];
      persistLogs();
      renderLogs(container);
      renderPanel();
    };
  }
  const ruleModeNames = {
    replaceRequest: '替换请求',
    replaceResponse: '替换响应',
    modifyRequest: '修改请求',
    modifyResponse: '修改响应',
    redirect: '重定向'
  };
  function renderRuleEditor(editor, rule, onSave) {
    const current = normalizeRule(rule || {
      id: 'rule-' + Date.now(), enabled: true, name: '用户规则', mode: 'modifyResponse',
      match: { url: '', regex: false }, modify: { pattern: '', replacement: '', regex: true }
    });
    editor.style.display = 'block';
    editor.innerHTML = `<label>规则名称<input id="rName"></label><label>模式<select id="rMode"><option value="replaceRequest">替换请求</option><option value="replaceResponse">替换响应</option><option value="modifyRequest">修改请求</option><option value="modifyResponse">修改响应</option><option value="redirect">重定向</option></select></label><label>URL匹配内容<input id="rMatchUrl"></label><label><input id="rMatchRegex" type="checkbox"> URL使用正则匹配</label><div id="rReplaceFields"><h5>替换内容</h5><label><input id="rLineEnabled" type="checkbox"> 重写请求行</label><label>请求方法<input id="rMethod"></label><label>请求URL<input id="rRequestUrl"></label><label><input id="rHeadersEnabled" type="checkbox"> 重写请求头</label><label>请求头（JSON）<textarea id="rRequestHeaders" rows="4">{}</textarea></label><label><input id="rBodyEnabled" type="checkbox"> 重写请求体</label><label>请求体<textarea id="rRequestBody" rows="4"></textarea></label><label><input id="rResponseBodyEnabled" type="checkbox"> 重写响应体</label><label>响应体<textarea id="rResponseBody" rows="4"></textarea></label></div><div id="rModifyFields"><label>正则匹配内容<input id="rPattern"></label><label>修改内容<input id="rReplacement"></label><label><input id="rModifyRegex" type="checkbox" checked> 使用正则替换</label></div><div id="rRedirectFields"><label>重定向URL<input id="rRedirectUrl"></label></div><div class="actions"><button id="saveRule">保存规则</button><button class="secondary" id="cancelRule">取消</button></div>`;
    const set = (id, value) => { const el = editor.querySelector('#' + id); if (el) el.value = value == null ? '' : value; };
    const check = (id, value) => { const el = editor.querySelector('#' + id); if (el) el.checked = !!value; };
    set('rName', current.name); set('rMode', current.mode); set('rMatchUrl', current.match.url); check('rMatchRegex', current.match.regex);
    set('rMethod', current.request.method); set('rRequestUrl', current.request.url); set('rRequestHeaders', current.request.headers); set('rRequestBody', current.request.body); check('rLineEnabled', current.request.lineEnabled); check('rHeadersEnabled', current.request.headersEnabled); check('rBodyEnabled', current.request.bodyEnabled);
    set('rResponseBody', current.response.body); check('rResponseBodyEnabled', current.response.bodyEnabled);
    set('rPattern', current.modify.pattern); set('rReplacement', current.modify.replacement); check('rModifyRegex', current.modify.regex); set('rRedirectUrl', current.redirect.url);
    const refresh = () => {
      const mode = editor.querySelector('#rMode').value;
      editor.querySelector('#rReplaceFields').style.display = mode.indexOf('replace') === 0 ? 'block' : 'none';
      editor.querySelector('#rModifyFields').style.display = mode.indexOf('modify') === 0 ? 'block' : 'none';
      editor.querySelector('#rRedirectFields').style.display = mode === 'redirect' ? 'block' : 'none';
      editor.querySelector('#rLineEnabled').parentElement.style.display = mode === 'replaceRequest' ? 'block' : 'none';
      editor.querySelector('#rMethod').parentElement.style.display = mode === 'replaceRequest' ? 'block' : 'none';
      editor.querySelector('#rRequestUrl').parentElement.style.display = mode === 'replaceRequest' ? 'block' : 'none';
      editor.querySelector('#rHeadersEnabled').parentElement.style.display = mode === 'replaceRequest' ? 'block' : 'none';
      editor.querySelector('#rRequestHeaders').parentElement.style.display = mode === 'replaceRequest' ? 'block' : 'none';
      editor.querySelector('#rBodyEnabled').parentElement.style.display = mode === 'replaceRequest' ? 'block' : 'none';
      editor.querySelector('#rRequestBody').parentElement.style.display = mode === 'replaceRequest' ? 'block' : 'none';
      editor.querySelector('#rResponseBodyEnabled').parentElement.style.display = mode === 'replaceResponse' ? 'block' : 'none';
      editor.querySelector('#rResponseBody').parentElement.style.display = mode === 'replaceResponse' ? 'block' : 'none';
    };
    editor.querySelector('#rMode').onchange = refresh;
    editor.querySelector('#cancelRule').onclick = () => { editor.style.display = 'none'; editor.innerHTML = ''; };
    editor.querySelector('#saveRule').onclick = () => {
      const mode = editor.querySelector('#rMode').value;
      const next = {
        id: current.id, enabled: current.enabled !== false, name: editor.querySelector('#rName').value.trim() || '用户规则', mode,
        match: { url: editor.querySelector('#rMatchUrl').value.trim(), regex: editor.querySelector('#rMatchRegex').checked },
        request: { lineEnabled: editor.querySelector('#rLineEnabled').checked, headersEnabled: editor.querySelector('#rHeadersEnabled').checked, bodyEnabled: editor.querySelector('#rBodyEnabled').checked, method: editor.querySelector('#rMethod').value.trim(), url: editor.querySelector('#rRequestUrl').value.trim(), headers: editor.querySelector('#rRequestHeaders').value, body: editor.querySelector('#rRequestBody').value },
        response: { lineEnabled: false, headersEnabled: false, bodyEnabled: editor.querySelector('#rResponseBodyEnabled').checked, headers: '{}', body: editor.querySelector('#rResponseBody').value },
        modify: { pattern: editor.querySelector('#rPattern').value, replacement: editor.querySelector('#rReplacement').value, regex: editor.querySelector('#rModifyRegex').checked },
        redirect: { url: editor.querySelector('#rRedirectUrl').value.trim() }
      };
      onSave(next);
    };
    refresh();
  }
  function renderRules(container) {
    container.innerHTML = '<h4>请求重写 <button id="addRule">新增</button></h4><div id="ruleEditor" class="editor" style="display:none"></div><div id="ruleList"></div>';
    const editor = container.querySelector('#ruleEditor');
    const save = rule => { const index = config.rules.findIndex(item => item.id === rule.id); if (index >= 0) config.rules[index] = rule; else config.rules.push(rule); saveConfig(); emitConfig(); renderRules(container); };
    container.querySelector('#addRule').onclick = () => renderRuleEditor(editor, null, save);
    const list = container.querySelector('#ruleList');
    config.rules.forEach(rule => {
      const normalized = normalizeRule(rule);
      const row = document.createElement('div'); row.className = 'rule';
      row.innerHTML = `<button class="danger delete-rule">删除</button><button class="secondary edit-rule">编辑</button><label><input type="checkbox" ${normalized.enabled ? 'checked' : ''}> 启用</label><b>${esc(normalized.name || normalized.id)}</b><br>模式：${esc(ruleModeNames[normalized.mode] || normalized.mode)}<br>URL：${esc(normalized.match.url)}${normalized.match.regex ? '（正则）' : ''}`;
      row.querySelector('input').onchange = e => { normalized.enabled = e.target.checked; config.rules = config.rules.map(item => item.id === normalized.id ? normalized : item); saveConfig(); emitConfig(); };
      row.querySelector('.edit-rule').onclick = () => renderRuleEditor(editor, normalized, save);
      row.querySelector('.delete-rule').onclick = () => { config.rules = config.rules.filter(item => item.id !== normalized.id); saveConfig(); emitConfig(); renderRules(container); };
      list.appendChild(row);
    });
  }
  function renderSettings(container) {
    const defaultTestUrl = 'https://me.hxxy.edu.cn/studentwork/PunchMStudent/GetActivityList';
    container.innerHTML = `<h4>设置</h4><label><input id="domEnabled" type="checkbox" ${config.domPatchEnabled ? 'checked' : ''}> 启用字段修补</label><label><input id="apiEnabled" type="checkbox" ${config.apiEnabled ? 'checked' : ''}> 启用API规则</label><label><input id="logEnabled" type="checkbox" ${config.logEnabled ? 'checked' : ''}> 记录API日志</label><label><input id="uaEnabled" type="checkbox" ${config.uaEnabled ? 'checked' : ''}> 锁定页面UA</label><label>最多保留日志条数<input id="maxLogs" type="number" min="20" max="1000" value="${config.maxLogs}"></label><button id="saveSettings">保存设置</button><div class="editor ios-request-test"><h4>iOS 请求测试</h4><label>请求方式<select id="iosTestMethod"><option>GET</option><option selected>POST</option><option>PUT</option><option>DELETE</option></select></label><label>接口地址<input id="iosTestUrl" value="${esc(defaultTestUrl)}" placeholder="输入返回JSON的接口"></label><label>请求头（JSON）<textarea id="iosTestHeaders" rows="3">{}</textarea></label><label>请求数据<textarea id="iosTestBody" rows="4" placeholder="GET数据会附加到查询参数">page=1&size=1000</textarea></label><button id="runIosRequestTest">开始测试</button><pre id="iosRequestTestResult">环境：${RUNTIME_ENVIRONMENT.isIOS ? 'iOS' : '非 iOS'}\n等待测试</pre></div>`;
    container.querySelector('#saveSettings').onclick = () => {
      config.domPatchEnabled = container.querySelector('#domEnabled').checked;
      config.apiEnabled = container.querySelector('#apiEnabled').checked;
      config.logEnabled = container.querySelector('#logEnabled').checked;
      config.uaEnabled = container.querySelector('#uaEnabled').checked;
      config.maxLogs = Number(container.querySelector('#maxLogs').value) || 200;
      logs = logs.slice(0, Math.max(20, config.maxLogs));
      saveConfig();
      persistLogs();
      emitConfig();
      renderPanel();
      alertInPanel(container, '设置已保存，API Hook开关刷新页面后完整生效');
    };
    container.querySelector('#runIosRequestTest').onclick = async event => {
      const resultNode = container.querySelector('#iosRequestTestResult');
      const button = event.currentTarget;
      const method = container.querySelector('#iosTestMethod').value.toUpperCase();
      const rawUrl = container.querySelector('#iosTestUrl').value.trim();
      const rawHeaders = container.querySelector('#iosTestHeaders').value;
      const rawBody = container.querySelector('#iosTestBody').value;
      if (!rawUrl) {
        resultNode.textContent = '请输入接口地址';
        return;
      }
      const headers = parseHeaders(rawHeaders);
      if (!headers || Array.isArray(headers) || typeof headers !== 'object') {
        resultNode.textContent = '请求头不是有效的JSON对象';
        return;
      }
      const normalized = normalizeBody(rawBody, headers);
      const options = { method, url: rawUrl, headers: normalized.headers };
      if (rawBody && method === 'GET') {
        try {
          options.url = appendQueryToUrl(rawUrl, normalized.body);
        } catch (error) {
          resultNode.textContent = `GET参数转换失败：${error.message}`;
          return;
        }
      } else if (rawBody) {
        options.body = normalized.body;
      }
      button.disabled = true;
      resultNode.textContent = `正在执行方案 A：GM_xmlhttpRequest (withCredentials)...\n${method} ${options.url}`;
      try {
        const diagnostic = await runIOSRequestDiagnostic(options);
        resultNode.textContent = formatIOSDiagnosticReport(diagnostic, options);
      } catch (error) {
        resultNode.textContent = `测试过程异常：${error && error.message ? error.message : String(error)}`;
      } finally {
        button.disabled = false;
      }
    };
  }
  function createPanel() {
    if (window.top !== window.self) return;
    if (!config.panelEnabled || window.top.__HX_PANEL_CREATED__ || document.getElementById('hxxy-enhancer-host')) return;
    const mount = () => {
      if (window.top.__HX_PANEL_CREATED__ || document.getElementById('hxxy-enhancer-host')) return true;
      const parent = document.documentElement || document.body;
      if (!parent) return false;
      const host = document.createElement('div');
      host.id = 'hxxy-enhancer-host';
      host.style.setProperty('position', 'fixed', 'important');
      host.style.setProperty('display', 'block', 'important');
      host.style.setProperty('z-index', '2147483647', 'important');
      host.style.setProperty('width', '16px', 'important');
      host.style.setProperty('height', '16px', 'important');
      host.style.setProperty('left', '16px', 'important');
      host.style.setProperty('top', '48px', 'important');
      host.style.setProperty('right', 'auto', 'important');
      host.style.setProperty('bottom', 'auto', 'important');
      const shadow = host.attachShadow({
        mode: 'open'
      });
      parent.appendChild(host);
      window.top.__HX_PANEL_CREATED__ = true;
      const style = document.createElement('style');
      style.textContent = `:host{position:fixed;display:block;width:42px;height:42px;z-index:2147483647;opacity:.9;font-family:Arial,sans-serif;color:#1f2937;pointer-events:none}*{box-sizing:border-box}button{border:0;border-radius:6px;padding:7px 10px;background:#2563eb;color:white;cursor:pointer;font-size:12px}.toggle,.panel{pointer-events:auto}.toggle{width:42px;height:42px;border-radius:50%;padding:0;box-shadow:0 4px 16px #0004;font-size:18px}.panel{display:none;position:fixed;width:min(410px, calc(100vw - 16px));max-width:calc(100vw - 16px);max-height:min(76vh, calc(100vh - 16px));overflow:auto;background:#fff;border:1px solid #cbd5e1;border-radius:10px;box-shadow:0 10px 32px #0004;padding:14px;margin:0}.panel.open{display:block}.head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;cursor:move;touch-action:none}.secondary{background:#64748b}.danger{background:#dc2626}h3{margin:0;font-size:16px}h4{margin:14px 0 6px;font-size:13px}.status{display:grid;grid-template-columns:1fr 1fr;gap:5px;font-size:12px;background:#f1f5f9;padding:8px;border-radius:6px}.actions{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}.rule,.saved-api,.tool-item{border-top:1px solid #e2e8f0;padding:7px 0;font-size:12px}.rule button{float:right;padding:3px 6px}.tool-item{display:flex;align-items:center;justify-content:space-between;gap:10px}.tool-item div{flex:1}.tool-item b,.tool-item small{display:block}.tool-item small{color:#64748b;margin-top:3px}.tool-head{display:flex;align-items:center;gap:10px;border-bottom:1px solid #e2e8f0;padding-bottom:6px}.tool-head h4{flex:1;margin:0}.log{border-top:1px solid #e2e8f0;padding:7px 0;font-size:11px;cursor:pointer;position:relative}.log small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:300px}.log .save-log{position:absolute;right:0;top:9px;padding:3px 6px}.saved-api{display:flex;gap:5px;align-items:center}.saved-api span{flex:1;overflow:hidden;text-overflow:ellipsis}.saved-api small{display:block;color:#64748b}pre{white-space:pre-wrap;word-break:break-word;background:#0f172a;color:#e2e8f0;padding:8px;border-radius:6px;max-height:260px;overflow:auto;font-size:11px}label{display:block;margin:6px 0;font-size:12px}input,select,textarea{width:100%;border:1px solid #cbd5e1;border-radius:5px;padding:6px;font:12px Arial;background:white;color:#111827}input[type=checkbox]{width:auto}.editor{border:1px solid #93c5fd;background:#eff6ff;padding:8px;border-radius:6px;margin:6px 0}`;
      shadow.appendChild(style);
      const root = document.createElement('div');
      root.innerHTML = '<button class="toggle" title="打开Zhang华夏系统增强工具">华夏</button><section class="panel"><div class="head"><h3>Zhang华夏系统增强</h3><button class="secondary close">收起</button></div><div class="status"></div><div class="actions"><button class="auto">自动</button><button class="toolbox">工具箱</button><button class="logs">API日志</button><button class="api">API调试</button><button class="rules">重写规则</button><button class="copy-cookies">复制Cookies</button><button class="settings">设置</button></div><div class="content"></div></section>';
      shadow.appendChild(root);
      const panel = root.querySelector('.panel');
      const head = root.querySelector('.head');
      const toggle = root.querySelector('.toggle');
      let drag = null;
      const updatePanelPlacement = () => {
        if (!panel.classList.contains('open')) return;
        const ball = toggle.getBoundingClientRect();
        const panelWidth = Math.min(panel.offsetWidth || 410, Math.max(0, window.innerWidth - 16));
        const panelHeight = Math.min(panel.offsetHeight || 0, Math.max(0, window.innerHeight - 16));
        const gap = 8;
        const openRight = ball.left + ball.width / 2 < window.innerWidth / 2;
        const openDown = ball.top + ball.height / 2 < window.innerHeight / 2;
        let left = openRight ? ball.right + gap : ball.left - panelWidth - gap;
        let top = openDown ? ball.bottom + gap : ball.top - panelHeight - gap;
        left = Math.max(8, Math.min(Math.max(8, window.innerWidth - panelWidth - 8), left));
        top = Math.max(8, Math.min(Math.max(8, window.innerHeight - panelHeight - 8), top));
        panel.style.left = left + 'px';
        panel.style.top = top + 'px';
        panel.dataset.placement = `${openRight ? 'right' : 'left'}-${openDown ? 'bottom' : 'top'}`;
      };
      toggle.onclick = () => {
        if (toggle.__HX_DRAGGED__) {
          toggle.__HX_DRAGGED__ = false;
          return;
        }
        const open = !panel.classList.contains('open');
        panel.classList.toggle('open', open);
        host.style.setProperty('width', '42px', 'important');
        host.style.setProperty('height', '42px', 'important');
        if (open) {
          renderPanel();
          const content = root.querySelector('.content');
          // 首次打开默认显示工具箱；关闭后重开保持上次面板，不自行跳转
          if (!content.dataset.view && !content.innerHTML) renderToolbox(content);
          requestAnimationFrame(updatePanelPlacement);
        }
      };
      root.querySelector('.close').onclick = () => {
        panel.classList.remove('open');
        host.style.setProperty('width', '42px', 'important');
        host.style.setProperty('height', '42px', 'important');
      };
      const openAutoTasks = () => {
        const content = root.querySelector('.content');
        content.dataset.view = 'auto';
        const ctx = {
          request: requestWithCurrentIdentity,
          showResult: () => {},
          openInternalPage: () => {},
          reload: () => openAutoTasks(),
          back: () => renderToolbox(content)
        };
        renderAutoTasks(content, ctx);
      };
      root.querySelector('.auto').onclick = openAutoTasks;
      root.querySelector('.toolbox').onclick = () => {
        const content = root.querySelector('.content');
        content.dataset.view = 'toolbox';
        renderToolbox(content);
      };
      root.querySelector('.logs').onclick = () => renderLogs(root.querySelector('.content'));
      root.querySelector('.rules').onclick = () => {
        const content = root.querySelector('.content');
        content.dataset.view = 'rules';
        renderRules(content);
      };
      root.querySelector('.api').onclick = () => {
        const content = root.querySelector('.content');
        content.dataset.view = 'api';
        renderApiTest(content);
      };
      root.querySelector('.copy-cookies').onclick = () => copyCurrentCookies(root.querySelector('.content'));
      root.querySelector('.settings').onclick = () => {
        const content = root.querySelector('.content');
        content.dataset.view = 'settings';
        renderSettings(content);
      };
      const beginDragging = (e, source, allowButton) => {
        if (e.button !== 0 || (!allowButton && e.target.closest && e.target.closest('button'))) return;
        const rect = toggle.getBoundingClientRect();
        const anchorX = source === toggle ? e.clientX - rect.left : rect.width / 2;
        const anchorY = source === toggle ? e.clientY - rect.top : rect.height / 2;
        drag = {
          pointerId: e.pointerId,
          source,
          startX: e.clientX,
          startY: e.clientY,
          x: anchorX,
          y: anchorY,
          userSelect: document.documentElement.style.userSelect,
          moved: false
        };
        host.style.setProperty('left', rect.left + 'px', 'important');
        host.style.setProperty('top', rect.top + 'px', 'important');
        host.style.setProperty('right', 'auto', 'important');
        host.style.setProperty('bottom', 'auto', 'important');
        document.documentElement.style.userSelect = 'none';
        try {
          source.setPointerCapture(e.pointerId);
        } catch (error) {}
        e.preventDefault();
        e.stopPropagation();
      };
      head.addEventListener('pointerdown', e => beginDragging(e, head, false));
      toggle.addEventListener('pointerdown', e => beginDragging(e, toggle, true));
      window.addEventListener('pointermove', e => {
        if (!drag || e.pointerId !== drag.pointerId) return;
        if (Math.abs(e.clientX - drag.startX) > 3 || Math.abs(e.clientY - drag.startY) > 3) drag.moved = true;
        const width = host.offsetWidth || 42;
        const height = host.offsetHeight || 42;
        const maxLeft = Math.max(0, window.innerWidth - width);
        const maxTop = Math.max(0, window.innerHeight - height);
        host.style.setProperty('left', Math.min(maxLeft, Math.max(0, e.clientX - drag.x)) + 'px', 'important');
        host.style.setProperty('top', Math.min(maxTop, Math.max(0, e.clientY - drag.y)) + 'px', 'important');
        updatePanelPlacement();
        e.preventDefault();
      }, {
        capture: true,
        passive: false
      });
      const stopDragging = e => {
        if (!drag || (e.pointerId != null && e.pointerId !== drag.pointerId)) return;
        try {
          if (drag.source.hasPointerCapture(drag.pointerId)) drag.source.releasePointerCapture(drag.pointerId);
        } catch (error) {}
        if (drag.source === toggle && drag.moved) toggle.__HX_DRAGGED__ = true;
        document.documentElement.style.userSelect = drag.userSelect;
        drag = null;
      };
      window.addEventListener('pointerup', stopDragging, true);
      window.addEventListener('pointercancel', stopDragging, true);
      window.addEventListener('blur', stopDragging, true);
      window.addEventListener('resize', updatePanelPlacement);
      window.addEventListener(EVENT_LOG, e => {
        addLog(e.detail);
        if (panel.classList.contains('open')) {
          const content = root.querySelector('.content');
          if (content && content.dataset.view === 'logs') renderLogs(content);
          renderPanel();
        }
      });
      renderPanel();
      return true;
    };
    if (!mount()) document.addEventListener('DOMContentLoaded', mount, {
      once: true
    });
  }
  function renderPanel() {
    const host = document.getElementById('hxxy-enhancer-host');
    if (!host || !host.shadowRoot) return;
    const status = host.shadowRoot.querySelector('.status');
    if (status) status.innerHTML = `<div>Hook: <b>${config.hookEnabled && config.apiEnabled ? 'ON' : 'OFF'}</b></div><div>字段修补: <b>${config.domPatchEnabled ? 'ON' : 'OFF'}</b></div><div>API规则: <b>${config.rules.filter(x => x.enabled).length}</b></div><div>自动任务: <b>${autoTasksState.running ? '运行中' : 'OFF'}</b></div><div>日志: <b>${logs.length}</b></div>`;
    const content = host.shadowRoot.querySelector('.content');
    // 默认定位到工具箱；已有视图或内容时保持不动
    if (content && !content.dataset.view && !content.innerHTML) renderToolbox(content);
  }
  startWatchdog();
  startDomPatch();
  createPanel();
  if (config.autoConfig.autoStartOnLoad) {
    autoStartTasks({
      request: requestWithCurrentIdentity,
      showResult: () => {},
      openInternalPage: () => {},
      reload: () => {},
      back: () => {}
    });
  }
  localLog('log', `华夏系统增强工具 ${VERSION} 已启动`);
})();