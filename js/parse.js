/* ============================================================
   parse.js —— 文件解析（CSV / XLSX / JSON）
   - 编码回退：UTF-8 优先，检测到乱码回退 GBK/GB18030
   - JSON 列解析：images / history
   - 列名归一化与自动识别
   ============================================================ */
(function (global) {
  'use strict';

  /* ---------- 编码解码：UTF-8 → GBK 回退 ---------- */
  function decodeBuffer(buffer) {
    var bytes = new Uint8Array(buffer);
    // UTF-8 BOM
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      return new TextDecoder('utf-8').decode(bytes.subarray(3));
    }
    // 先按 UTF-8 严格解码；失败则视为非 UTF-8
    try {
      var strict = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return strict;
    } catch (e) {
      // 回退到 GBK（浏览器原生支持 gbk/gb18030 解码）
      for (var i = 0; i < 2; i++) {
        var enc = i === 0 ? 'gbk' : 'gb18030';
        try {
          return new TextDecoder(enc).decode(bytes);
        } catch (e2) { /* 继续尝试 */ }
      }
      // 最后宽松 UTF-8
      return new TextDecoder('utf-8').decode(bytes);
    }
  }

  /* ---------- 读文件为 ArrayBuffer ---------- */
  function readArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(fr.error); };
      fr.readAsArrayBuffer(file);
    });
  }

  /* ---------- CSV ---------- */
  function parseCSV(text) {
    var res = Papa.parse(text, {
      header: true,
      skipEmptyLines: 'greedy',
      dynamicTyping: false
    });
    return { headers: res.meta.fields || [], rows: res.data || [] };
  }

  /* ---------- XLSX ---------- */
  function parseXLSX(buffer) {
    var wb = XLSX.read(buffer, { type: 'array' });
    var ws = wb.Sheets[wb.SheetNames[0]];
    var arr = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
    if (!arr.length) return { headers: [], rows: [] };
    var headers = arr[0].map(function (h) { return String(h == null ? '' : h).trim(); });
    var rows = [];
    for (var i = 1; i < arr.length; i++) {
      var obj = {};
      var allEmpty = true;
      for (var c = 0; c < headers.length; c++) {
        var v = arr[i][c];
        obj[headers[c]] = v == null ? '' : String(v);
        if (obj[headers[c]] !== '') allEmpty = false;
      }
      if (!allEmpty) rows.push(obj);
    }
    return { headers: headers, rows: rows };
  }

  /* ---------- JSON ---------- */
  function parseJSON(text) {
    var data = JSON.parse(text);
    var arr;
    if (Array.isArray(data)) arr = data;
    else if (data && Array.isArray(data.data)) arr = data.data;
    else if (data && Array.isArray(data.rows)) arr = data.rows;
    else if (data && typeof data === 'object') arr = [data];
    else arr = [];
    var headerSet = [];
    var seen = {};
    arr.forEach(function (o) {
      if (o && typeof o === 'object') {
        Object.keys(o).forEach(function (k) {
          if (!seen[k]) { seen[k] = true; headerSet.push(k); }
        });
      }
    });
    // 值转字符串，保持与 CSV 一致（对象/数组序列化）
    var rows = arr.map(function (o) {
      var out = {};
      headerSet.forEach(function (k) {
        var v = o ? o[k] : '';
        if (v == null) out[k] = '';
        else if (typeof v === 'object') out[k] = JSON.stringify(v);
        else out[k] = String(v);
      });
      return out;
    });
    return { headers: headerSet, rows: rows };
  }

  /* ---------- 主入口：按扩展名解析 ---------- */
  function parseFile(file) {
    var name = (file.name || '').toLowerCase();
    return readArrayBuffer(file).then(function (buffer) {
      if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        return parseXLSX(buffer);
      }
      var text = decodeBuffer(buffer);
      if (name.endsWith('.json')) return parseJSON(text);
      return parseCSV(text); // 默认按 CSV
    });
  }

  /* ---------- 列名归一化 ---------- */
  function normalize(s) {
    return String(s || '').toLowerCase().replace(/[\s_\-]+/g, '').trim();
  }

  // 目标字段 → 候选别名（归一化后比较）
  var FIELD_ALIASES = {
    traceId: ['traceid', 'trace', 'traceids', 'id', 'caseid', 'traceidkey'],
    prompt: ['prompt', 'query', 'question', 'userprompt', 'input', 'currentprompt', 'userquery', '当前prompt', 'prompt当前轮'],
    images: ['images', 'image', 'imageurls', 'imgs', 'imageurl', 'pics', 'currentimages'],
    history: ['history', 'histories', 'chathistory', 'conversationhistory', 'context', 'historyturns', '历史'],
    // 整列式：单列即含完整多轮对话（OpenAI messages 数组）
    messages: ['messages', 'message', 'conversation', 'conversations', 'dialogue', 'dialog',
               'answer完整', '完整回复', '完整对话', '对话', 'chat', 'messagelist', 'answerfull', 'fullconversation']
  };

  /* 自动识别列 → 返回映射 {traceId, prompt, images, history, messages}，找不到为 null */
  function autoDetect(headers) {
    var map = { traceId: null, prompt: null, images: null, history: null, messages: null };
    var normHeaders = headers.map(function (h) { return { raw: h, norm: normalize(h) }; });

    Object.keys(FIELD_ALIASES).forEach(function (field) {
      var aliases = FIELD_ALIASES[field];
      // 1) 精确别名匹配
      for (var i = 0; i < normHeaders.length; i++) {
        if (aliases.indexOf(normHeaders[i].norm) !== -1) { map[field] = normHeaders[i].raw; return; }
      }
      // 2) 包含匹配（例如 "trace ID" 归一化后 = traceid）
      for (var j = 0; j < normHeaders.length; j++) {
        for (var k = 0; k < aliases.length; k++) {
          if (normHeaders[j].norm === aliases[k]) { map[field] = normHeaders[j].raw; return; }
        }
      }
    });
    return map;
  }

  /* ---------- 解析 JSON 列值 ---------- */
  // images: '["url1","url2"]' 或逗号分隔字符串 → 数组
  function parseImages(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val.filter(Boolean);
    var s = String(val).trim();
    if (!s || s === '[]' || s === 'null') return [];
    try {
      var arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.filter(function (x) { return x != null && String(x).trim(); }).map(String);
      if (typeof arr === 'string') return [arr];
    } catch (e) {
      // 非 JSON：可能是单个 URL 或逗号/换行分隔
      if (/^https?:\/\//i.test(s)) {
        return s.split(/[\n,]+/).map(function (x) { return x.trim(); }).filter(Boolean);
      }
    }
    return [];
  }

  // history: '[{"prompt","answer","images","convidx"}]' → 规范化轮次数组
  function parseHistory(val) {
    if (!val) return [];
    if (Array.isArray(val)) return normalizeTurns(val);
    var s = String(val).trim();
    if (!s || s === '[]' || s === 'null') return [];
    try {
      var arr = JSON.parse(s);
      if (Array.isArray(arr)) return normalizeTurns(arr);
      if (arr && typeof arr === 'object') return normalizeTurns([arr]);
    } catch (e) { /* 解析失败返回空 */ }
    return [];
  }

  function normalizeTurns(arr) {
    var turns = arr.map(function (t, i) {
      if (typeof t === 'string') return { prompt: t, answer: '', images: [], convidx: i * 2 };
      t = t || {};
      var idx = t.convidx != null ? parseInt(t.convidx, 10) : i * 2;
      if (isNaN(idx)) idx = i * 2;
      return {
        prompt: t.prompt != null ? String(t.prompt) : (t.query != null ? String(t.query) : ''),
        answer: t.answer != null ? String(t.answer) : (t.response != null ? String(t.response) : ''),
        images: parseImages(t.images),
        convidx: idx
      };
    });
    turns.sort(function (a, b) { return a.convidx - b.convidx; });
    return turns;
  }

  /* ---------- 整列式 messages（OpenAI 风格）---------- */
  // 输入：'[{"role":"user","content":"..."},{"role":"assistant","content":[{"type":"text","text":"..."},{"type":"image_url","image_url":{"url":"..."}}]}]'
  // 输出：[{ role:'user'|'assistant', text:'', images:[url] }, ...]
  function parseMessages(val) {
    if (val == null || val === '') return [];
    var arr;
    if (Array.isArray(val)) arr = val;
    else {
      var s = String(val).trim();
      if (!s || s === '[]' || s === 'null') return [];
      try {
        arr = JSON.parse(s);
      } catch (e) { return []; }
    }
    if (!Array.isArray(arr)) {
      if (arr && Array.isArray(arr.messages)) arr = arr.messages;
      else return [];
    }
    return arr.map(function (m) {
      m = m || {};
      var role = m.role === 'assistant' || m.role === 'ai' || m.role === 'bot' || m.role === 'model'
        ? 'assistant'
        : (m.role === 'system' ? 'system' : 'user');
      var text = '';
      var images = [];
      var content = m.content;
      if (typeof content === 'string') {
        text = content;
      } else if (Array.isArray(content)) {
        content.forEach(function (seg) {
          if (seg == null) return;
          if (typeof seg === 'string') { text += (text ? '\n' : '') + seg; return; }
          if (seg.type === 'text' || seg.text != null) {
            if (seg.text != null) text += (text ? '\n' : '') + String(seg.text);
          } else if (seg.type === 'image_url' || seg.image_url != null) {
            var iu = seg.image_url;
            var url = iu && typeof iu === 'object' ? iu.url : iu;
            if (url) images.push(String(url));
          } else if (seg.type === 'image' && seg.url) {
            images.push(String(seg.url));
          }
        });
      } else if (content != null && typeof content === 'object') {
        // 兜底：{text, images}
        if (content.text != null) text = String(content.text);
        images = images.concat(parseImages(content.images));
      }
      return { role: role, text: text, images: images };
    }).filter(function (m) { return m.role !== 'system' || m.text; });
  }

  /* ---------- 把分列式(prompt/images/history)统一成消息序列 ---------- */
  // 输出与 parseMessages 一致：[{role,text,images}]，末尾为当前轮 user
  function turnsToMessages(history, curPrompt, curImages) {
    var msgs = [];
    (history || []).forEach(function (t) {
      if (t.prompt || (t.images && t.images.length)) msgs.push({ role: 'user', text: t.prompt || '', images: t.images || [] });
      if (t.answer) msgs.push({ role: 'assistant', text: t.answer, images: [] });
    });
    msgs.push({ role: 'user', text: curPrompt || '', images: curImages || [] });
    return msgs;
  }

  global.Parser = {
    parseFile: parseFile,
    autoDetect: autoDetect,
    parseImages: parseImages,
    parseHistory: parseHistory,
    parseMessages: parseMessages,
    turnsToMessages: turnsToMessages,
    decodeBuffer: decodeBuffer
  };
})(window);
